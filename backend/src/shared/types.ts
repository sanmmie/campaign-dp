export interface AssetRef {
  id: string;
  url: string;
  width?: number;
  height?: number;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface CampaignPackBrand {
  primary: string;
  secondary: string;
  accent: string;
  lockup?: AssetRef;
}

export interface CampaignPackAssets {
  candidatePortrait: AssetRef[];
  backgroundTextures: AssetRef[];
}

export interface CampaignPackDefaultCopy {
  headline: string;
  subhead: string;
}

export type ShareTarget = 'whatsapp' | 'facebook' | 'x' | 'telegram';

export interface CampaignPack {
  id: string;
  name: string;
  authorizedBy: string | null;
  authorizationRef: string | null;
  disclaimer: string;
  brand: CampaignPackBrand;
  assets: CampaignPackAssets;
  templates: Template[];
  defaultCopy: CampaignPackDefaultCopy;
  shareTargets: ShareTarget[];
  createdAt: string;
  updatedAt: string;
}

export interface TemplateCanvas {
  width: number;
  height: number;
}

export interface TemplatePhotoZone {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: 'circle' | 'square' | 'rounded-rect' | 'free';
  borderRadius?: number;
  locked: boolean;
}

export type LayerType = 'image' | 'text' | 'photo' | 'shape';

export interface BaseLayer {
  id: string;
  type: LayerType;
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

export interface ImageLayer extends BaseLayer {
  type: 'image';
  src: string;
  fit?: 'cover' | 'contain' | 'fill' | 'none';
}

export interface TextLayer extends BaseLayer {
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
  maxHeight?: number;
}

export interface PhotoLayer extends BaseLayer {
  type: 'photo';
  shape: 'circle' | 'square' | 'rounded-rect' | 'free';
  borderRadius?: number;
}

export interface ShapeLayer extends BaseLayer {
  type: 'shape';
  shapeType: 'rect' | 'circle' | 'ellipse' | 'polygon';
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  borderRadius?: number;
  points?: number[];
}

export type TemplateLayer = ImageLayer | TextLayer | PhotoLayer | ShapeLayer;

export type TemplateCategory = 
  | 'political' 
  | 'campaign' 
  | 'community' 
  | 'youth' 
  | 'business' 
  | 'event' 
  | 'celebration' 
  | 'awareness' 
  | 'culture' 
  | 'custom';

export interface TemplateVersion {
  id: string;
  templateId: string;
  version: number;
  name: string;
  category: TemplateCategory;
  canvas: TemplateCanvas;
  photoZone: TemplatePhotoZone;
  layers: TemplateLayer[];
  isPublished: boolean;
  publishedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Template {
  id: string;
  name: string;
  category: TemplateCategory;
  latestVersion: number;
  versions: TemplateVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface ExportPreset {
  id: string;
  name: string;
  width: number;
  height: number;
  format: 'png' | 'jpg' | 'webp';
  quality?: number;
  dpi?: number;
}

export const EXPORT_PRESETS: ExportPreset[] = [
  { id: 'instagram-square', name: 'Instagram Square', width: 1080, height: 1080, format: 'png' },
  { id: 'instagram-portrait', name: 'Instagram Portrait', width: 1080, height: 1350, format: 'png' },
  { id: 'whatsapp-dp', name: 'WhatsApp DP', width: 1080, height: 1080, format: 'png' },
  { id: 'facebook-post', name: 'Facebook Post', width: 1200, height: 630, format: 'png' },
  { id: 'x-post', name: 'X Post', width: 1600, height: 900, format: 'png' },
  { id: 'story', name: 'Story', width: 1080, height: 1920, format: 'png' },
  { id: 'printable-a4', name: 'Printable A4 (300 DPI)', width: 2480, height: 3508, format: 'png', dpi: 300 },
];

export interface Project {
  id: string;
  userId: string | null;
  packId: string;
  templateId: string;
  templateVersion: number;
  templateSnapshot: TemplateVersion;
  photoUrl: string | null;
  photoTransform: PhotoTransform | null;
  textValues: Record<string, string>;
  editorState: EditorState;
  exportSettings: ExportSettings;
  createdAt: string;
  updatedAt: string;
}

export interface PhotoTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  crop?: { x: number; y: number; width: number; height: number };
}

export interface EditorState {
  zoom: number;
  panX: number;
  panY: number;
  selectedLayerId: string | null;
  showGrid: boolean;
  snapToGrid: boolean;
}

export interface ExportSettings {
  presetId: string;
  format: 'png' | 'jpg' | 'webp';
  quality: number;
  includeDisclaimer: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  defaultName: string | null;
  defaultTitle: string | null;
  defaultOrganisation: string | null;
  defaultWardLGA: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationRecord {
  id: string;
  projectId: string;
  storagePath: string | null;
  userId: string | null;
  presetId: string;
  format: string;
  fileSize: number;
  width: number;
  height: number;
  createdAt: string;
}

export interface AbuseReport {
  id: string;
  targetType: 'template' | 'generation' | 'project';
  targetId: string;
  reporterId: string | null;
  reason: string;
  details: string | null;
  status: 'pending' | 'reviewed' | 'dismissed' | 'actioned';
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface AnalyticsEvent {
  event: string;
  properties: Record<string, unknown>;
  timestamp: string;
  userId?: string;
  sessionId: string;
}

export const SUPPORTED_LOCALES = ['en', 'yo', 'ha', 'ig'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export interface FontDefinition {
  id: string;
  name: string;
  family: string;
  weights: number[];
  url: string;
  unicodeRanges: string[];
  supportsYoruba: boolean;
  variable?: boolean;
}

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

export interface UploadConfig {
  maxBytes: number;
  maxPixels: number;
  allowedMimeTypes: string[];
}

export const DEFAULT_UPLOAD_CONFIG: UploadConfig = {
  maxBytes: 10 * 1024 * 1024,
  maxPixels: 40 * 1000 * 1000,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
};

export const DISCLAIMER_TEXT = 'User-generated campaign material. Not an official communication.';

export function isAuthorized(pack: CampaignPack): boolean {
  return pack.authorizedBy !== null && pack.authorizedBy.trim().length > 0;
}

export function getAuthorizedLayers(pack: CampaignPack): AssetRef[] {
  if (!isAuthorized(pack)) return [];
  return [
    ...(pack.brand.lockup ? [pack.brand.lockup] : []),
    ...pack.assets.candidatePortrait,
  ];
}

export function resolveTemplateSnapshot(
  template: Template,
  version: number
): TemplateVersion | null {
  return template.versions.find(v => v.version === version) ?? null;
}

export function createPhotoTransform(): PhotoTransform {
  return {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    flipX: false,
    flipY: false,
  };
}

export function createEditorState(): EditorState {
  return {
    zoom: 1,
    panX: 0,
    panY: 0,
    selectedLayerId: null,
    showGrid: false,
    snapToGrid: true,
  };
}

export function createExportSettings(): ExportSettings {
  return {
    presetId: 'instagram-square',
    format: 'png',
    quality: 90,
    includeDisclaimer: true,
  };
}