import sharp from 'sharp';
import { Readable } from 'stream';
import { env } from '../config/env';
import { DEFAULT_UPLOAD_CONFIG } from '../shared/types';

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  format: string;
  mimeType: string;
}

export interface UploadValidationResult {
  valid: boolean;
  error?: string;
  metadata?: {
    width: number;
    height: number;
    format: string;
    mimeType: string;
    size: number;
  };
}

export async function validateUpload(buffer: Buffer, mimeType: string): Promise<UploadValidationResult> {
  if (!DEFAULT_UPLOAD_CONFIG.allowedMimeTypes.includes(mimeType)) {
    return { valid: false, error: 'Unsupported file type. Only JPEG, PNG, and WebP are allowed.' };
  }

  if (buffer.length > env.UPLOAD_MAX_BYTES) {
    return { valid: false, error: `File size exceeds ${env.UPLOAD_MAX_BYTES / (1024 * 1024)} MB limit.` };
  }

  try {
    const metadata = await sharp(buffer).metadata();
    
    if (!metadata.width || !metadata.height) {
      return { valid: false, error: 'Could not determine image dimensions.' };
    }

    const pixelCount = metadata.width * metadata.height;
    if (pixelCount > env.UPLOAD_MAX_PIXELS) {
      return { valid: false, error: `Image exceeds ${env.UPLOAD_MAX_PIXELS / 1000000} MP limit.` };
    }

    return {
      valid: true,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format || 'unknown',
        mimeType,
        size: buffer.length,
      },
    };
  } catch (error) {
    return { valid: false, error: 'Invalid or corrupted image file.' };
  }
}

export async function processUpload(buffer: Buffer, mimeType: string): Promise<ProcessedImage> {
  const validation = await validateUpload(buffer, mimeType);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const processed = await sharp(buffer)
    .rotate() // Auto-rotate based on EXIF orientation
    // Metadata (EXIF, ICC profiles) is stripped by default when withMetadata is not used
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });

  const metadata = await sharp(processed.data).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Could not determine processed image dimensions.');
  }

  return {
    buffer: processed.data,
    width: metadata.width,
    height: metadata.height,
    format: 'png',
    mimeType: 'image/png',
  };
}

export async function generateExport(
  templateBuffer: Buffer,
  preset: { width: number; height: number; format: 'png' | 'jpg' | 'webp'; quality?: number; dpi?: number }
): Promise<Buffer> {
  let pipeline = sharp(templateBuffer)
    .resize(preset.width, preset.height, {
      fit: 'cover',
      position: 'center',
    });

  if (preset.dpi) {
    pipeline = pipeline.withMetadata({ density: preset.dpi });
  }

  switch (preset.format) {
    case 'png':
      pipeline = pipeline.png({ compressionLevel: 9 });
      break;
    case 'jpg':
      pipeline = pipeline.jpeg({ quality: preset.quality || 90, mozjpeg: true });
      break;
    case 'webp':
      pipeline = pipeline.webp({ quality: preset.quality || 90, lossless: false });
      break;
  }

  return pipeline.toBuffer();
}

export async function generatePreview(
  templateBuffer: Buffer,
  maxDimension: number = 512
): Promise<Buffer> {
  const metadata = await sharp(templateBuffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Invalid template buffer');
  }

  const scale = Math.min(maxDimension / metadata.width, maxDimension / metadata.height, 1);
  
  return sharp(templateBuffer)
    .resize(Math.round(metadata.width * scale), Math.round(metadata.height * scale))
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function createThumbnail(buffer: Buffer, size: number = 256): Promise<Buffer> {
  return sharp(buffer)
    .resize(size, size, { fit: 'cover', position: 'center' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export function bufferToStream(buffer: Buffer): Readable {
  const readable = new Readable();
  readable.push(buffer);
  readable.push(null);
  return readable;
}

export async function getImageMetadata(buffer: Buffer): Promise<sharp.Metadata> {
  return sharp(buffer).metadata();
}