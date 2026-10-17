import sharp from 'sharp';
import {
  CampaignPack,
  TemplateVersion,
  TextLayer,
  ShapeLayer,
  PhotoTransform,
  AssetRef,
} from '../shared/types';
import { safeFetchBuffer } from '../lib/urlSecurity';

interface RenderOptions {
  pack: CampaignPack;
  template: TemplateVersion;
  photoBuffer?: Buffer;
  photoTransform?: PhotoTransform;
  textValues: Record<string, string>;
  preset: {
    width: number;
    height: number;
    format: 'png' | 'jpg' | 'webp';
    quality?: number;
    dpi?: number;
  };
  includeDisclaimer: boolean;
}

const IDENTITY_TRANSFORM: PhotoTransform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  flipX: false,
  flipY: false,
};

function hexToRgba(hex: string, alpha: number = 1): {
  r: number;
  g: number;
  b: number;
  alpha: number;
} {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return { r, g, b, alpha };
}

function escapeSvgText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createTextSvg(
  layer: TextLayer,
  text: string,
  canvasWidth: number,
  canvasHeight: number
): string {
  const { r, g, b, alpha } = hexToRgba(layer.color, layer.opacity || 1);

  const fontFamily = layer.fontFamily.replace(/'/g, "\\'");
  const fontWeight = layer.fontWeight;
  const fontSize = layer.fontSize;
  const lineHeight = layer.lineHeight;
  const letterSpacing = layer.letterSpacing;

  let textAnchor = 'middle';
  if (layer.alignment === 'left') textAnchor = 'start';
  if (layer.alignment === 'right') textAnchor = 'end';

  const x = layer.x;
  const y = layer.y + fontSize * 0.35; // Baseline adjustment

  let transformedText = text;
  if (layer.textTransform === 'uppercase') transformedText = text.toUpperCase();
  if (layer.textTransform === 'lowercase') transformedText = text.toLowerCase();
  if (layer.textTransform === 'capitalize') {
    transformedText = transformedText.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const lines = transformedText.split('\n');
  const lineHeightPx = fontSize * lineHeight;

  const tspans = lines
    .map((line) =>
      `<tspan x="${x}" dy="${lineHeightPx}">${escapeSvgText(line)}</tspan>`
    )
    .join('');

  return `
    <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
      <text
        x="${x}"
        y="${y}"
        font-family="${fontFamily}"
        font-weight="${fontWeight}"
        font-size="${fontSize}"
        fill="rgba(${r}, ${g}, ${b}, ${alpha})"
        text-anchor="${textAnchor}"
        dominant-baseline="hanging"
        letter-spacing="${letterSpacing}px"
      >
        ${tspans}
      </text>
    </svg>
  `;
}

function createShapeSvg(
  layer: ShapeLayer,
  canvasWidth: number,
  canvasHeight: number
): string {
  const { r, g, b, alpha } = hexToRgba(layer.fill, layer.opacity || 1);
  let stroke = '';
  if (layer.stroke) {
    const { r: sr, g: sg, b: sb, alpha: sa } = hexToRgba(
      layer.stroke,
      layer.opacity || 1
    );
    stroke = `stroke="rgba(${sr}, ${sg}, ${sb}, ${sa})" stroke-width="${
      layer.strokeWidth || 1
    }"`;
  }

  let shape = '';
  switch (layer.shapeType) {
    case 'rect':
      shape = `<rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="${layer.borderRadius || 0}" ry="${layer.borderRadius || 0}" fill="rgba(${r}, ${g}, ${b}, ${alpha})" ${stroke} />`;
      break;
    case 'circle':
      shape = `<circle cx="${layer.x + (layer.width || 0) / 2}" cy="${layer.y + (layer.height || 0) / 2}" r="${Math.min(layer.width || 0, layer.height || 0) / 2}" fill="rgba(${r}, ${g}, ${b}, ${alpha})" ${stroke} />`;
      break;
    case 'ellipse':
      shape = `<ellipse cx="${layer.x + (layer.width || 0) / 2}" cy="${layer.y + (layer.height || 0) / 2}" rx="${(layer.width || 0) / 2}" ry="${(layer.height || 0) / 2}" fill="rgba(${r}, ${g}, ${b}, ${alpha})" ${stroke} />`;
      break;
    case 'polygon': {
      if (layer.points && layer.points.length > 0) {
        const points = layer.points.map((p) => `${layer.x + p}`).join(' ');
        shape = `<polygon points="${points}" fill="rgba(${r}, ${g}, ${b}, ${alpha})" ${stroke} />`;
      }
      break;
    }
  }

  return `
    <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
      ${shape}
    </svg>
  `;
}

async function loadAsset(asset: AssetRef): Promise<Buffer> {
  const fetched = await safeFetchBuffer(asset.url);
  if (!fetched.ok || !fetched.buffer) {
    throw new Error(`Failed to load asset: ${asset.url}`);
  }
  return fetched.buffer;
}

export async function renderTemplate(
  options: RenderOptions
): Promise<Buffer> {
  const {
    pack,
    template,
    photoBuffer,
    photoTransform,
    textValues,
    preset,
    includeDisclaimer,
  } = options;

  const canvasWidth = template.canvas.width;
  const canvasHeight = template.canvas.height;

  const baseImage = sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });

  const composite: sharp.OverlayOptions[] = [];

  const sortedLayers = [...template.layers].sort(
    (a, b) => (a.zIndex || 0) - (b.zIndex || 0)
  );

  for (const layer of sortedLayers) {
    if (!layer.visible) continue;

    if (layer.type === 'image' && layer.src) {
      let assetBuffer: Buffer;

      if (layer.src.startsWith('pack://')) {
        const assetRef = layer.src.replace('pack://', '');
        let asset: AssetRef | undefined;

        if (assetRef === 'lockup') {
          asset = pack.brand.lockup;
        } else if (assetRef.startsWith('bg-')) {
          asset = pack.assets.backgroundTextures.find(
            (a) => a.id === assetRef
          );
        } else if (assetRef.startsWith('portrait-')) {
          asset = pack.assets.candidatePortrait.find(
            (a) => a.id === assetRef
          );
        }

        if (!asset) {
          continue;
        }

        assetBuffer = await loadAsset(asset);
      } else {
        const response = await fetch(layer.src);
        if (!response.ok) {
          continue;
        }
        assetBuffer = Buffer.from(await response.arrayBuffer());
      }

      const processed = await sharp(assetBuffer)
        .resize(layer.width, layer.height, {
          fit: layer.fit && layer.fit !== 'none' ? layer.fit : 'cover',
        })
        .rotate(layer.rotation || 0)
        .toBuffer();

      composite.push({
        input: processed,
        left: Math.round(layer.x),
        top: Math.round(layer.y),
        blend: 'over',
      });
    }

    if (layer.type === 'text') {
      const text = textValues[layer.id] || layer.text || '';
      const svg = createTextSvg(layer, text, canvasWidth, canvasHeight);
      const svgBuffer = Buffer.from(svg);

      const processed = await sharp(svgBuffer)
        .resize(canvasWidth, canvasHeight)
        .toBuffer();

      composite.push({
        input: processed,
        left: 0,
        top: 0,
        blend: 'over',
      });
    }

    if (layer.type === 'shape') {
      const svg = createShapeSvg(layer, canvasWidth, canvasHeight);
      const svgBuffer = Buffer.from(svg);

      const processed = await sharp(svgBuffer)
        .resize(canvasWidth, canvasHeight)
        .toBuffer();

      composite.push({
        input: processed,
        left: 0,
        top: 0,
        blend: 'over',
      });
    }

    if (layer.type === 'photo' && photoBuffer) {
      if (!layer.width || !layer.height) continue;

      const transform: PhotoTransform = {
        ...IDENTITY_TRANSFORM,
        ...photoTransform,
      };

      let photo = sharp(photoBuffer);

      if (transform.crop) {
        photo = photo.extract({
          left: Math.max(0, Math.round(transform.crop.x)),
          top: Math.max(0, Math.round(transform.crop.y)),
          width: Math.max(1, Math.round(transform.crop.width)),
          height: Math.max(1, Math.round(transform.crop.height)),
        });
      }

      const targetWidth = Math.max(1, Math.round(layer.width * transform.scaleX));
      const targetHeight = Math.max(
        1,
        Math.round(layer.height * transform.scaleY)
      );

      photo = photo.resize(targetWidth, targetHeight, { fit: 'cover' });

      if (transform.flipX) {
        photo = photo.flop();
      }

      if (transform.flipY) {
        photo = photo.flip();
      }

      if (transform.rotation !== 0) {
        photo = photo.rotate(transform.rotation);
      }

      const processed = await photo.toBuffer();

      let masked: Buffer;
      if (layer.shape === 'circle') {
        const mask = Buffer.from(
          `<svg width="${targetWidth}" height="${targetHeight}" xmlns="http://www.w3.org/2000/svg">
            <circle cx="${targetWidth / 2}" cy="${targetHeight / 2}" r="${Math.min(targetWidth, targetHeight) / 2}" fill="white"/>
          </svg>`
        );
        masked = await sharp(processed)
          .composite([{ input: mask, blend: 'dest-in' }])
          .png()
          .toBuffer();
      } else if (layer.shape === 'rounded-rect') {
        const radius = layer.borderRadius || 20;
        const mask = Buffer.from(
          `<svg width="${targetWidth}" height="${targetHeight}" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="${targetWidth}" height="${targetHeight}" rx="${radius}" ry="${radius}" fill="white"/>
          </svg>`
        );
        masked = await sharp(processed)
          .composite([{ input: mask, blend: 'dest-in' }])
          .png()
          .toBuffer();
      } else {
        masked = processed;
      }

      composite.push({
        input: masked,
        left: Math.round(layer.x + transform.x),
        top: Math.round(layer.y + transform.y),
        blend: 'over',
      });
    }
  }

  if (includeDisclaimer && pack.disclaimer) {
    const disclaimerSvg = `
      <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
        <text
          x="${canvasWidth / 2}"
          y="${canvasHeight - 30}"
          font-family="sans-serif"
          font-weight="400"
          font-size="14"
          fill="rgba(0, 0, 0, 0.6)"
          text-anchor="middle"
          dominant-baseline="hanging"
        >
          ${escapeSvgText(pack.disclaimer)}
        </text>
        <text
          x="${canvasWidth / 2}"
          y="${canvasHeight - 14}"
          font-family="sans-serif"
          font-weight="400"
          font-size="12"
          fill="rgba(0, 0, 0, 0.4)"
          text-anchor="middle"
          dominant-baseline="hanging"
        >
          Powered by &#916;Os Core
        </text>
      </svg>
    `;

    const disclaimerBuffer = await sharp(Buffer.from(disclaimerSvg))
      .resize(canvasWidth, canvasHeight)
      .toBuffer();

    composite.push({
      input: disclaimerBuffer,
      left: 0,
      top: 0,
      blend: 'over',
    });
  }

  const result = await baseImage
    .composite(composite)
    .resize(preset.width, preset.height, { fit: 'cover', position: 'center' })
    .toBuffer();

  return result;
}

export async function renderPreview(
  options: RenderOptions
): Promise<Buffer> {
  const fullRender = await renderTemplate(options);
  return sharp(fullRender)
    .resize(512, 512, { fit: 'inside' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
