import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  validateUpload,
  processUpload,
  generatePreview,
  createThumbnail,
} from './imageProcessing';

async function makeImage(
  width: number,
  height: number,
  format: 'png' | 'jpeg' = 'png'
): Promise<Buffer> {
  const pipeline = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  });
  return format === 'jpeg' ? pipeline.jpeg().toBuffer() : pipeline.png().toBuffer();
}

describe('validateUpload', () => {
  it('accepts a valid PNG image', async () => {
    const buffer = await makeImage(10, 10);
    const result = await validateUpload(buffer, 'image/png');
    expect(result.valid).toBe(true);
    expect(result.metadata?.width).toBe(10);
    expect(result.metadata?.height).toBe(10);
  });

  it('rejects unsupported mime types', async () => {
    const buffer = await makeImage(10, 10);
    const result = await validateUpload(buffer, 'image/gif');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unsupported file type');
  });

  it('rejects corrupted image buffers', async () => {
    const result = await validateUpload(
      Buffer.from('not-an-image-at-all'),
      'image/png'
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('corrupted');
  });

  it('rejects images with indeterminate dimensions', async () => {
    const emptySvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    );
    const result = await validateUpload(emptySvg, 'image/png');
    expect(result.valid).toBe(false);
  });
});

describe('processUpload', () => {
  it('converts JPEG to PNG and reports dimensions', async () => {
    const jpeg = await makeImage(20, 20, 'jpeg');
    const processed = await processUpload(jpeg, 'image/jpeg');
    expect(processed.mimeType).toBe('image/png');
    expect(processed.format).toBe('png');
    expect(processed.width).toBe(20);
    expect(processed.height).toBe(20);
  });

  it('throws for invalid uploads', async () => {
    await expect(
      processUpload(Buffer.from('nope'), 'image/jpeg')
    ).rejects.toThrow();
  });
});

describe('generatePreview', () => {
  it('resizes a large image down to the max dimension', async () => {
    const buffer = await makeImage(1000, 500);
    const preview = await generatePreview(buffer, 512);
    const metadata = await sharp(preview).metadata();
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(256);
  });

  it('does not upscale small images', async () => {
    const buffer = await makeImage(100, 100);
    const preview = await generatePreview(buffer, 512);
    const metadata = await sharp(preview).metadata();
    expect(metadata.width).toBe(100);
    expect(metadata.height).toBe(100);
  });
});

describe('createThumbnail', () => {
  it('produces a square thumbnail', async () => {
    const buffer = await makeImage(800, 400);
    const thumbnail = await createThumbnail(buffer, 256);
    const metadata = await sharp(thumbnail).metadata();
    expect(metadata.width).toBe(256);
    expect(metadata.height).toBe(256);
  });
});
