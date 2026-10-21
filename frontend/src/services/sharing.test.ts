import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getShareUrl,
  supportsNativeShare,
  nativeShare,
  copyToClipboard,
  downloadImage,
  openShareWindow,
} from './sharing';

const content = {
  title: 'Renewed Hope 2027',
  text: 'I support this campaign!',
  url: 'https://campaign-dp.vercel.app/campaigns/renewed-hope',
};

describe('Phase 9 — share link generation', () => {
  it('builds a WhatsApp intent with the encoded message', () => {
    const url = getShareUrl('whatsapp', content);
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    const decoded = decodeURIComponent(url.split('text=')[1] as string);
    expect(decoded).toContain('Renewed Hope 2027');
    expect(decoded).toContain(content.url);
  });

  it('builds a Facebook sharer URL with the encoded target', () => {
    const url = getShareUrl('facebook', content);
    expect(url).toContain('facebook.com/sharer');
    expect(url).toContain(encodeURIComponent(content.url));
  });

  it('builds an X intent with the encoded target', () => {
    const url = getShareUrl('x', content);
    expect(url).toContain('twitter.com/intent/tweet');
    expect(url).toContain(encodeURIComponent(content.url));
  });

  it('builds a Telegram share URL', () => {
    const url = getShareUrl('telegram', content);
    expect(url).toContain('t.me/share/url');
    expect(url).toContain(encodeURIComponent(content.url));
  });

  it('falls back to the plain url for an unknown target', () => {
    expect(getShareUrl('unknown' as any, content)).toBe(content.url);
  });

  it('escapes query-breaking characters in the shared text', () => {
    const url = getShareUrl('facebook', { ...content, text: 'a&b=c?d#e' });
    expect(url).toContain(encodeURIComponent('a&b=c?d#e'));
  });
});

describe('Phase 9 — native share', () => {
  const originalShare = navigator.share;

  afterEach(() => {
    if (originalShare) {
      Object.defineProperty(navigator, 'share', { value: originalShare, configurable: true });
    } else {
      Reflect.deleteProperty(navigator, 'share');
    }
  });

  it('reports that native share is unsupported when the API is missing', () => {
    Reflect.deleteProperty(navigator, 'share');
    expect(supportsNativeShare()).toBe(false);
  });

  it('returns false when native share is unavailable', async () => {
    Reflect.deleteProperty(navigator, 'share');
    await expect(nativeShare(content)).resolves.toBe(false);
  });

  it('passes the share payload to the Web Share API', async () => {
    const shareMock = vi.fn(async (_payload: any) => undefined);
    Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true });

    await expect(nativeShare(content)).resolves.toBe(true);
    expect(shareMock).toHaveBeenCalledTimes(1);
    const payload = shareMock.mock.calls[0]?.[0] as any;
    expect(payload.title).toBe(content.title);
    expect(payload.url).toBe(content.url);
  });

  it('returns false when the user aborts the share sheet', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    Object.defineProperty(navigator, 'share', {
      value: vi.fn(async () => {
        throw abortError;
      }),
      configurable: true,
    });

    await expect(nativeShare(content)).resolves.toBe(false);
  });

  it('still shares the link when the image cannot be loaded', async () => {
    const shareMock = vi.fn(async (_payload: any) => undefined);
    Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    try {
      const result = await nativeShare({ ...content, imageUrl: 'https://cdn.example.com/a.png' });
      expect(result).toBe(true);
      const payload = shareMock.mock.calls[0]?.[0] as any;
      expect(payload.files).toBeUndefined();
      expect(payload.url).toBe(content.url);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('Phase 9 — clipboard and download', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => undefined) },
      configurable: true,
    });
  });

  it('copies text with the clipboard API when available', async () => {
    await expect(copyToClipboard('https://example.com')).resolves.toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://example.com');
  });

  it('reports failure when the clipboard is not usable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn(async () => {
          throw new Error('denied');
        }),
      },
      configurable: true,
    });

    await expect(copyToClipboard('x')).resolves.toBe(false);
  });

  it('triggers a download for the generated image', () => {
    const clicks: string[] = [];
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      clicks.push(this.download);
    };

    try {
      downloadImage('https://cdn.example.com/a.png', 'my-dp.png');
      expect(clicks).toEqual(['my-dp.png']);
      expect(document.querySelectorAll('a')).toHaveLength(0);
    } finally {
      HTMLAnchorElement.prototype.click = originalClick;
    }
  });

  it('opens a centred share window', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    openShareWindow('whatsapp', content);
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(String(openSpy.mock.calls[0]?.[0])).toContain('wa.me');
    openSpy.mockRestore();
  });
});
