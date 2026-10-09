import 'dotenv/config';
import prisma from '../db/prisma';
import { env } from '../config/env';

const BRAND_PRIMARY = '#003366';
const BRAND_SECONDARY = '#006633';
const BRAND_ACCENT = '#FFCC00';

async function seedCampaignPack(): Promise<string> {
  const existing = await prisma.campaignPack.findUnique({
    where: { id: env.CAMPAIGN_PACK_ID },
  });

  if (existing) {
    console.log('Campaign pack already exists, skipping seed');
    return existing.id;
  }

  const pack = await prisma.campaignPack.create({
    data: {
      id: env.CAMPAIGN_PACK_ID,
      name: 'Renewed Hope 2027',
      authorizedBy: env.CAMPAIGN_AUTHORIZED_BY || null,
      authorizationRef: null,
      disclaimer: env.CAMPAIGN_DISCLAIMER,
      brandPrimary: BRAND_PRIMARY,
      brandSecondary: BRAND_SECONDARY,
      brandAccent: BRAND_ACCENT,
      defaultHeadline: 'Renewed Hope',
      defaultSubhead: 'Together we build a better future',
      shareTargets: JSON.stringify(['whatsapp', 'facebook', 'x', 'telegram']),
    },
  });

  console.log('Created campaign pack:', pack.id);
  return pack.id;
}

interface SeedLayer {
  id: string;
  type: 'image' | 'text' | 'photo' | 'shape';
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  locked: boolean;
  visible: boolean;
  zIndex: number;
}

interface SeedTextLayer extends SeedLayer {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  color: string;
  alignment: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  maxWidth?: number;
}

interface SeedShapeLayer extends SeedLayer {
  type: 'shape';
  shapeType: 'rect' | 'circle' | 'ellipse' | 'polygon';
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  borderRadius?: number;
}

interface SeedPhotoLayer extends SeedLayer {
  type: 'photo';
  shape: 'circle' | 'square' | 'rounded-rect' | 'free';
  borderRadius?: number;
}

interface SeedTemplate {
  id: string;
  name: string;
  category: string;
  canvasWidth: number;
  canvasHeight: number;
  photoZone: {
    x: number;
    y: number;
    width: number;
    height: number;
    shape: string;
    borderRadius?: number;
    locked: boolean;
  };
  layers: (SeedTextLayer | SeedShapeLayer | SeedPhotoLayer)[];
}

function textLayer(
  id: string,
  text: string,
  x: number,
  y: number,
  opts: Partial<Omit<SeedTextLayer, 'id' | 'type' | 'text' | 'x' | 'y' | 'locked' | 'visible' | 'zIndex'>> = {},
  zIndex = 10,
  maxWidth?: number
): SeedTextLayer {
  return {
    id,
    type: 'text',
    text,
    x,
    y,
    rotation: 0,
    opacity: 1,
    locked: false,
    visible: true,
    zIndex,
    fontSize: opts.fontSize ?? 48,
    fontFamily: opts.fontFamily ?? 'Inter',
    fontWeight: opts.fontWeight ?? 700,
    color: opts.color ?? '#FFFFFF',
    alignment: opts.alignment ?? 'center',
    lineHeight: opts.lineHeight ?? 1.2,
    letterSpacing: opts.letterSpacing ?? 0,
    textTransform: opts.textTransform ?? 'none',
    maxWidth,
  };
}

function shapeLayer(
  id: string,
  shapeType: SeedShapeLayer['shapeType'],
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  opts: Partial<SeedShapeLayer> = {},
  zIndex = 1
): SeedShapeLayer {
  return {
    id,
    type: 'shape',
    shapeType,
    x,
    y,
    width,
    height,
    fill,
    stroke: opts.stroke,
    strokeWidth: opts.strokeWidth,
    borderRadius: opts.borderRadius,
    rotation: 0,
    opacity: opts.opacity ?? 1,
    locked: opts.locked ?? true,
    visible: true,
    zIndex,
  };
}

function photoLayer(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  shape: SeedPhotoLayer['shape'],
  borderRadius?: number,
  zIndex = 5
): SeedPhotoLayer {
  return {
    id,
    type: 'photo',
    shape,
    borderRadius,
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    locked: false,
    visible: true,
    zIndex,
  };
}

const TEMPLATES: SeedTemplate[] = [
  {
    id: 'tpl-campaign-poster',
    name: 'Campaign Poster',
    category: 'campaign',
    canvasWidth: 1080,
    canvasHeight: 1350,
    photoZone: { x: 240, y: 120, width: 600, height: 600, shape: 'circle', locked: false },
    layers: [
      shapeLayer('bg', 'rect', 0, 0, 1080, 1350, BRAND_PRIMARY, { locked: true }, 0),
      shapeLayer('accent-band', 'rect', 0, 1080, 1080, 270, BRAND_SECONDARY, { locked: true }, 1),
      shapeLayer('accent-line', 'rect', 0, 1060, 1080, 8, BRAND_ACCENT, { locked: true }, 2),
      photoLayer('photo', 240, 120, 600, 600, 'circle', undefined, 5),
      textLayer('headline', 'Renewed Hope', 90, 780, { fontSize: 72, fontWeight: 800, color: '#FFFFFF' }, 10, 900),
      textLayer('subhead', 'Together we build a better future for all', 90, 880, { fontSize: 32, fontWeight: 400, color: '#FFFFFF', opacity: 0.9 }, 11, 900),
      textLayer('cta', 'Join the movement', 90, 990, { fontSize: 28, fontWeight: 600, color: BRAND_ACCENT, textTransform: 'uppercase', letterSpacing: 2 }, 12, 900),
    ],
  },
  {
    id: 'tpl-profile-picture',
    name: 'Profile Picture',
    category: 'political',
    canvasWidth: 1080,
    canvasHeight: 1080,
    photoZone: { x: 290, y: 140, width: 500, height: 500, shape: 'circle', locked: false },
    layers: [
      shapeLayer('bg', 'rect', 0, 0, 1080, 1080, BRAND_PRIMARY, { locked: true }, 0),
      shapeLayer('ring', 'circle', 270, 120, 540, 540, BRAND_ACCENT, { locked: true }, 1),
      photoLayer('photo', 290, 140, 500, 500, 'circle', undefined, 5),
      textLayer('name', 'Your Name', 90, 700, { fontSize: 56, fontWeight: 700, color: '#FFFFFF' }, 10, 900),
      textLayer('title', 'Your Title / Position', 90, 780, { fontSize: 30, fontWeight: 400, color: BRAND_ACCENT }, 11, 900),
      textLayer('org', 'Organisation', 90, 840, { fontSize: 24, fontWeight: 400, color: '#FFFFFF', opacity: 0.8 }, 12, 900),
    ],
  },
  {
    id: 'tpl-event-flyer',
    name: 'Event Flyer',
    category: 'event',
    canvasWidth: 1080,
    canvasHeight: 1350,
    photoZone: { x: 90, y: 700, width: 900, height: 450, shape: 'rounded-rect', borderRadius: 24, locked: false },
    layers: [
      shapeLayer('bg', 'rect', 0, 0, 1080, 1350, BRAND_SECONDARY, { locked: true }, 0),
      shapeLayer('header', 'rect', 0, 0, 1080, 420, BRAND_PRIMARY, { locked: true }, 1),
      textLayer('event-title', 'Town Hall Meeting', 60, 80, { fontSize: 64, fontWeight: 800, color: '#FFFFFF', alignment: 'left' }, 10, 960),
      textLayer('event-date', 'Saturday, 12 Oct 2026', 60, 220, { fontSize: 36, fontWeight: 600, color: BRAND_ACCENT, alignment: 'left' }, 11, 960),
      textLayer('event-venue', 'Community Centre, Ikeja', 60, 290, { fontSize: 28, fontWeight: 400, color: '#FFFFFF', alignment: 'left' }, 12, 960),
      photoLayer('photo', 90, 700, 900, 450, 'rounded-rect', 24, 5),
      textLayer('details', 'Join us for an open discussion on our vision for the community.', 90, 1200, { fontSize: 28, fontWeight: 400, color: '#FFFFFF' }, 13, 900),
    ],
  },
  {
    id: 'tpl-youth-rally',
    name: 'Youth Rally',
    category: 'youth',
    canvasWidth: 1080,
    canvasHeight: 1080,
    photoZone: { x: 390, y: 90, width: 300, height: 300, shape: 'circle', locked: false },
    layers: [
      shapeLayer('bg', 'rect', 0, 0, 1080, 1080, BRAND_ACCENT, { locked: true }, 0),
      shapeLayer('panel', 'rect', 60, 60, 960, 960, BRAND_PRIMARY, { borderRadius: 40, locked: true }, 1),
      photoLayer('photo', 390, 90, 300, 300, 'circle', undefined, 5),
      textLayer('headline', 'Youth for Change', 90, 450, { fontSize: 60, fontWeight: 800, color: '#FFFFFF' }, 10, 900),
      textLayer('subhead', 'The future belongs to the young', 90, 540, { fontSize: 28, fontWeight: 400, color: BRAND_ACCENT }, 11, 900),
      textLayer('hashtag', '#RenewedHope', 90, 880, { fontSize: 32, fontWeight: 700, color: '#FFFFFF', textTransform: 'uppercase' }, 12, 900),
    ],
  },
  {
    id: 'tpl-community-meetup',
    name: 'Community Meetup',
    category: 'community',
    canvasWidth: 1080,
    canvasHeight: 1080,
    photoZone: { x: 90, y: 90, width: 900, height: 500, shape: 'rounded-rect', borderRadius: 20, locked: false },
    layers: [
      shapeLayer('bg', 'rect', 0, 0, 1080, 1080, '#F5F5F5', { locked: true }, 0),
      shapeLayer('top-bar', 'rect', 0, 0, 1080, 12, BRAND_PRIMARY, { locked: true }, 1),
      photoLayer('photo', 90, 90, 900, 500, 'rounded-rect', 20, 5),
      textLayer('title', 'Community Meetup', 90, 640, { fontSize: 52, fontWeight: 700, color: BRAND_PRIMARY, alignment: 'left' }, 10, 900),
      textLayer('desc', 'Bringing people together for progress and shared purpose.', 90, 720, { fontSize: 26, fontWeight: 400, color: '#333333', alignment: 'left' }, 11, 900),
      textLayer('footer', 'All are welcome', 90, 950, { fontSize: 24, fontWeight: 600, color: BRAND_SECONDARY, alignment: 'left', textTransform: 'uppercase' }, 12, 900),
    ],
  },
  {
    id: 'tpl-awareness-post',
    name: 'Awareness Post',
    category: 'awareness',
    canvasWidth: 1080,
    canvasHeight: 1080,
    photoZone: { x: 340, y: 120, width: 400, height: 400, shape: 'rounded-rect', borderRadius: 16, locked: false },
    layers: [
      shapeLayer('bg', 'rect', 0, 0, 1080, 1080, BRAND_PRIMARY, { locked: true }, 0),
      shapeLayer('accent-circle', 'circle', 780, -80, 380, 380, BRAND_SECONDARY, { opacity: 0.5, locked: true }, 1),
      shapeLayer('accent-circle-2', 'circle', -100, 780, 300, 300, BRAND_ACCENT, { opacity: 0.4, locked: true }, 2),
      photoLayer('photo', 340, 120, 400, 400, 'rounded-rect', 16, 5),
      textLayer('message', 'Your Voice Matters', 90, 580, { fontSize: 64, fontWeight: 800, color: '#FFFFFF' }, 10, 900),
      textLayer('sub', 'Stand up. Speak out. Make a difference.', 90, 670, { fontSize: 28, fontWeight: 400, color: '#FFFFFF', opacity: 0.9 }, 11, 900),
      textLayer('brand', 'Renewed Hope 2027', 90, 960, { fontSize: 22, fontWeight: 600, color: BRAND_ACCENT, textTransform: 'uppercase', letterSpacing: 1 }, 12, 900),
    ],
  },
];

async function seedTemplates(packId: string): Promise<void> {
  for (const tpl of TEMPLATES) {
    const existingTemplate = await prisma.template.findUnique({
      where: { id: tpl.id },
    });
    if (existingTemplate) continue;

    const template = await prisma.template.create({
      data: {
        id: tpl.id,
        name: tpl.name,
        category: tpl.category as never,
        latestVersion: 1,
        packId,
      },
    });

    await prisma.templateVersion.create({
      data: {
        templateId: template.id,
        version: 1,
        name: tpl.name,
        category: tpl.category as never,
        canvasWidth: tpl.canvasWidth,
        canvasHeight: tpl.canvasHeight,
        photoZoneX: tpl.photoZone.x,
        photoZoneY: tpl.photoZone.y,
        photoZoneWidth: tpl.photoZone.width,
        photoZoneHeight: tpl.photoZone.height,
        photoZoneShape: tpl.photoZone.shape,
        photoZoneBorderRadius: tpl.photoZone.borderRadius ?? null,
        photoZoneLocked: tpl.photoZone.locked,
        layersJson: JSON.stringify(tpl.layers),
        isPublished: true,
        publishedAt: new Date(),
        createdBy: 'system',
      },
    });

    console.log('Created template:', tpl.name);
  }
}

async function seedFonts(): Promise<void> {
  const fonts = [
    {
      id: 'inter',
      name: 'Inter',
      family: 'Inter',
      weights: JSON.stringify([400, 500, 600, 700, 800]),
      url: 'https://fonts.gstatic.com/s/inter/v12/UcC66FwMYPXlJq6mYmcg.woff2',
      unicodeRanges: JSON.stringify(['Latin', 'Latin-Extended']),
      supportsYoruba: false,
      variable: true,
    },
    {
      id: 'noto-sans-yoruba',
      name: 'Noto Sans Yoruba',
      family: '"Noto Sans Yoruba"',
      weights: JSON.stringify([400, 500, 600, 700]),
      url: 'https://fonts.gstatic.com/s/notosansyoruba/v1/NotoSansYoruba-Regular.woff2',
      unicodeRanges: JSON.stringify(['Yoruba', 'Latin', 'Latin-Extended']),
      supportsYoruba: true,
      variable: false,
    },
    {
      id: 'noto-sans-hausa',
      name: 'Noto Sans Hausa',
      family: '"Noto Sans Hausa"',
      weights: JSON.stringify([400, 500, 600, 700]),
      url: 'https://fonts.gstatic.com/s/notosanshausa/v1/NotoSansHausa-Regular.woff2',
      unicodeRanges: JSON.stringify(['Hausa', 'Latin', 'Latin-Extended']),
      supportsYoruba: false,
      variable: false,
    },
    {
      id: 'noto-sans-igbo',
      name: 'Noto Sans Igbo',
      family: '"Noto Sans Igbo"',
      weights: JSON.stringify([400, 500, 600, 700]),
      url: 'https://fonts.gstatic.com/s/notosans/v30/o-0IIpQlx3QUlC5A.woff2',
      unicodeRanges: JSON.stringify(['Igbo', 'Latin', 'Latin-Extended']),
      supportsYoruba: false,
      variable: false,
    },
  ];

  for (const font of fonts) {
    const existing = await prisma.fontDefinition.findUnique({ where: { id: font.id } });
    if (!existing) {
      await prisma.fontDefinition.create({ data: font });
      console.log('Created font:', font.id);
    }
  }
}

async function main(): Promise<void> {
  console.log('Starting database seed...');
  const packId = await seedCampaignPack();
  await seedTemplates(packId);
  await seedFonts();
  console.log('Database seed completed');
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});