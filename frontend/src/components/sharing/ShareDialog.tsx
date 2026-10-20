import React, { useState } from 'react';
import { ShareTarget, CampaignPack } from '@deltadp/shared';
import { supportsNativeShare, nativeShare, openShareWindow, copyToClipboard, downloadImage } from '../../services/sharing';
import { useTranslation } from '../../i18n/I18nContext';
import { env } from '../../config/env';
import { Button } from '../ui/Button';

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  pack: CampaignPack | null;
  title: string;
  text: string;
  url: string;
  imageUrl?: string;
  generationId?: string;
}

export function ShareDialog({ isOpen, onClose, pack, title, text, url, imageUrl, generationId }: ShareDialogProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  if (!isOpen || !pack) return null;

  const shareData = { title, text, url, imageUrl };
  const targets = pack.shareTargets ?? [];

  const handleCopy = async () => {
    const result = await copyToClipboard(url);
    if (result) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNativeShare = async () => {
    await nativeShare(shareData);
  };

  const handleTarget = (target: ShareTarget) => {
    openShareWindow(target, shareData);
  };

  const handleDownload = async () => {
    if (generationId) {
      try {
        const response = await fetch(`${env.VITE_API_URL}/api/download/${generationId}`, {
          method: 'GET',
          credentials: 'include',
        });
        if (response.ok) {
          const blob = await response.blob();
          const downloadUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = `${title.replace(/\s+/g, '-').toLowerCase()}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(downloadUrl);
        } else if (imageUrl) {
          downloadImage(imageUrl, `${title.replace(/\s+/g, '-').toLowerCase()}.png`);
        }
      } catch {
        if (imageUrl) {
          downloadImage(imageUrl, `${title.replace(/\s+/g, '-').toLowerCase()}.png`);
        }
      }
    } else if (imageUrl) {
      downloadImage(imageUrl, `${title.replace(/\s+/g, '-').toLowerCase()}.png`);
    }
  };

  const targetIcons: Record<ShareTarget, string> = {
    whatsapp: '💬',
    facebook: '📘',
    x: '✖️',
    telegram: '✈️',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label={t('share.title')}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">{t('share.title')}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label={t('common.close')}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {supportsNativeShare() && (
          <Button variant="primary" className="w-full mb-4" onClick={handleNativeShare}>
            {t('share.title')}
          </Button>
        )}

        <div className="grid grid-cols-4 gap-3 mb-4">
          {targets.map((target) => (
            <button
              key={target}
              onClick={() => handleTarget(target)}
              className="flex flex-col items-center gap-2 p-3 rounded-lg border border-gray-200 hover:border-brand-primary hover:bg-brand-primary/5 transition-colors"
              aria-label={t(`share.${target}`)}
            >
              <span className="text-2xl" aria-hidden="true">{targetIcons[target]}</span>
              <span className="text-xs text-gray-600 capitalize">{target}</span>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <Button variant="outline" className="w-full" onClick={handleCopy}>
            {copied ? '✓ ' + t('share.copyLink') : t('share.copyLink')}
          </Button>
          {imageUrl && (
            <Button variant="secondary" className="w-full" onClick={handleDownload}>
              {t('share.download')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}