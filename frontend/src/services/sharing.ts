import { ShareTarget } from '@deltadp/shared';

export interface ShareContent {
  title: string;
  text: string;
  url: string;
  imageUrl?: string;
}

function buildWhatsappUrl(data: ShareContent): string {
  const message = `${data.title}\n${data.text}\n${data.url}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

function buildFacebookUrl(data: ShareContent): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(data.url)}&quote=${encodeURIComponent(data.text)}`;
}

function buildXUrl(data: ShareContent): string {
  const text = `${data.title} ${data.text}`;
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(data.url)}`;
}

function buildTelegramUrl(data: ShareContent): string {
  const text = `${data.title}\n${data.text}\n${data.url}`;
  return `https://t.me/share/url?url=${encodeURIComponent(data.url)}&text=${encodeURIComponent(text)}`;
}

export function getShareUrl(target: ShareTarget, data: ShareContent): string {
  switch (target) {
    case 'whatsapp':
      return buildWhatsappUrl(data);
    case 'facebook':
      return buildFacebookUrl(data);
    case 'x':
      return buildXUrl(data);
    case 'telegram':
      return buildTelegramUrl(data);
    default:
      return data.url;
  }
}

export function supportsNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export async function nativeShare(data: ShareContent): Promise<boolean> {
  if (!supportsNativeShare()) return false;
  try {
    const sharePayload: Record<string, unknown> = {
      title: data.title,
      text: data.text,
      url: data.url,
    };
    if (data.imageUrl) {
      try {
        const response = await fetch(data.imageUrl);
        const blob = await response.blob();
        const file = new File([blob], 'share.png', { type: blob.type });
        sharePayload.files = [file];
      } catch {
        // Image loading failed, share without file
      }
    }
    await navigator.share(sharePayload as Parameters<typeof navigator.share>[0]);
    return true;
  } catch (error) {
    const err = error as Error;
    if (err.name === 'AbortError') return false;
    return false;
  }
}

export function openShareWindow(target: ShareTarget, data: ShareContent): void {
  const url = getShareUrl(target, data);
  const width = 600;
  const height = 600;
  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;
  window.open(
    url,
    `share-${target}`,
    `width=${width},height=${height},left=${left},top=${top},toolbar=0,menubar=0,status=0`
  );
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const result = document.execCommand('copy');
    document.body.removeChild(textarea);
    return result;
  } catch {
    return false;
  }
}

export function downloadImage(imageUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = imageUrl;
  link.download = filename;
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}