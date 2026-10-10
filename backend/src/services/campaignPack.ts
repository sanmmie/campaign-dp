import prisma from '../db/prisma';
import { env } from '../config/env';
import { CampaignPack, Template, TemplateVersion, AssetRef, isAuthorized } from '../shared/types';

interface PackAssetRow {
  id: string;
  type: string;
  url: string;
  width: number | null;
  height: number | null;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: Date;
}

interface TemplateVersionRow {
  id: string;
  templateId: string;
  version: number;
  name: string;
  category: string;
  canvasWidth: number;
  canvasHeight: number;
  photoZoneX: number;
  photoZoneY: number;
  photoZoneWidth: number;
  photoZoneHeight: number;
  photoZoneShape: string;
  photoZoneBorderRadius: number | null;
  photoZoneLocked: boolean;
  layersJson: string;
  isPublished: boolean;
  publishedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TemplateRow {
  id: string;
  name: string;
  category: string;
  latestVersion: number;
  packId: string;
  createdAt: Date;
  updatedAt: Date;
  versions: TemplateVersionRow[];
}

interface CampaignPackRow {
  id: string;
  name: string;
  authorizedBy: string | null;
  authorizationRef: string | null;
  disclaimer: string;
  brandPrimary: string;
  brandSecondary: string;
  brandAccent: string;
  brandLockupId: string | null;
  defaultHeadline: string;
  defaultSubhead: string;
  shareTargets: string;
  createdAt: Date;
  updatedAt: Date;
  assets: PackAssetRow[];
  lockup: PackAssetRow | null;
  templates: TemplateRow[];
}

function mapAsset(asset: PackAssetRow): AssetRef {
  return {
    id: asset.id,
    url: asset.url,
    width: asset.width ?? undefined,
    height: asset.height ?? undefined,
    mimeType: asset.mimeType,
    uploadedAt: asset.uploadedAt.toISOString(),
    uploadedBy: asset.uploadedBy,
  };
}

function mapTemplateVersion(v: TemplateVersionRow): TemplateVersion {
  return {
    id: v.id,
    templateId: v.templateId,
    version: v.version,
    name: v.name,
    category: v.category as TemplateVersion['category'],
    canvas: { width: v.canvasWidth, height: v.canvasHeight },
    photoZone: {
      x: v.photoZoneX,
      y: v.photoZoneY,
      width: v.photoZoneWidth,
      height: v.photoZoneHeight,
      shape: v.photoZoneShape as TemplateVersion['photoZone']['shape'],
      borderRadius: v.photoZoneBorderRadius ?? undefined,
      locked: v.photoZoneLocked,
    },
    layers: JSON.parse(v.layersJson),
    isPublished: v.isPublished,
    publishedAt: v.publishedAt?.toISOString(),
    createdBy: v.createdBy,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

function mapTemplate(t: TemplateRow): Template {
  return {
    id: t.id,
    name: t.name,
    category: t.category as Template['category'],
    latestVersion: t.latestVersion,
    versions: t.versions.map(mapTemplateVersion).sort((a, b) => a.version - b.version),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

function groupAssetsByType(
  assets: PackAssetRow[]
): Record<string, AssetRef[]> {
  const grouped: Record<string, AssetRef[]> = {};
  for (const asset of assets) {
    const list = grouped[asset.type] ?? [];
    list.push(mapAsset(asset));
    grouped[asset.type] = list;
  }
  return grouped;
}

function toCampaignPack(pack: CampaignPackRow): CampaignPack {
  const assetsByType = groupAssetsByType(pack.assets);
  let shareTargets: CampaignPack['shareTargets'] = ['whatsapp', 'facebook', 'x', 'telegram'];
  try {
    const parsed = JSON.parse(pack.shareTargets);
    if (Array.isArray(parsed)) {
      shareTargets = parsed;
    }
  } catch {
    // Use defaults if parsing fails
  }
  return {
    id: pack.id,
    name: pack.name,
    authorizedBy: pack.authorizedBy,
    authorizationRef: pack.authorizationRef,
    disclaimer: pack.disclaimer,
    brand: {
      primary: pack.brandPrimary,
      secondary: pack.brandSecondary,
      accent: pack.brandAccent,
      lockup: pack.lockup ? mapAsset(pack.lockup) : undefined,
    },
    assets: {
      candidatePortrait: assetsByType['candidatePortrait'] || [],
      backgroundTextures: assetsByType['backgroundTextures'] || [],
    },
    templates: pack.templates.map(mapTemplate),
    defaultCopy: {
      headline: pack.defaultHeadline,
      subhead: pack.defaultSubhead,
    },
    shareTargets,
    createdAt: pack.createdAt.toISOString(),
    updatedAt: pack.updatedAt.toISOString(),
  };
}

export async function getCampaignPack(packId?: string): Promise<CampaignPack | null> {
  const id = packId || env.CAMPAIGN_PACK_ID;
  
  const pack = await prisma.campaignPack.findUnique({
    where: { id },
    include: {
      assets: true,
      lockup: true,
      templates: {
        where: { versions: { some: { isPublished: true } } },
        include: {
          versions: {
            where: { isPublished: true },
            orderBy: { version: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      },
    },
  });

  if (!pack) return null;

  return toCampaignPack(pack);
}

export async function getTemplateById(templateId: string, version?: number): Promise<TemplateVersion | null> {
  const template = await prisma.template.findUnique({
    where: { id: templateId },
    include: {
      versions: {
        where: version ? { version } : { isPublished: true },
        orderBy: { version: 'desc' },
        take: 1,
      },
    },
  });

  if (!template || template.versions.length === 0) return null;
  const versionRow = template.versions[0];
  if (!versionRow) return null;
  return mapTemplateVersion(versionRow);
}

export async function getPublishedTemplates(packId?: string): Promise<Template[]> {
  const id = packId || env.CAMPAIGN_PACK_ID;
  
  const templates = await prisma.template.findMany({
    where: {
      packId: id,
      versions: { some: { isPublished: true } },
    },
    include: {
      versions: {
        where: { isPublished: true },
        orderBy: { version: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  return templates.map(mapTemplate);
}

export function getAuthorizedAssets(pack: CampaignPack): AssetRef[] {
  return isAuthorized(pack) 
    ? [...(pack.brand.lockup ? [pack.brand.lockup] : []), ...pack.assets.candidatePortrait]
    : [];
}

export async function createPackAsset(
  packId: string,
  type: string,
  url: string,
  mimeType: string,
  uploadedBy: string,
  width?: number,
  height?: number
): Promise<AssetRef> {
  const asset = await prisma.packAsset.create({
    data: {
      packId,
      type,
      url,
      mimeType,
      uploadedBy,
      width,
      height,
    },
  });
  return mapAsset(asset);
}

export async function updatePackAuthorization(
  packId: string,
  authorizedBy: string | null,
  authorizationRef: string | null,
  disclaimer: string
): Promise<CampaignPack | null> {
  const pack = await prisma.campaignPack.update({
    where: { id: packId },
    data: {
      authorizedBy,
      authorizationRef,
      disclaimer,
    },
    include: {
      assets: true,
      lockup: true,
      templates: {
        include: {
          versions: { where: { isPublished: true }, orderBy: { version: 'asc' } },
        },
      },
    },
  });

  if (!pack) return null;

  return toCampaignPack(pack);
}