import React, { useEffect, useState, useCallback } from 'react';
import { clsx } from 'clsx';
import QRCode from 'qrcode';

interface QrCodeProps {
  value: string;
  size?: number;
  margin?: number;
  color?: string;
  background?: string;
  className?: string;
}

export function QrCode({
  value,
  size = 128,
  margin = 2,
  color = '#1a1a1a',
  background = '#ffffff',
  className,
}: QrCodeProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateQr = useCallback(async () => {
    try {
      setError(null);
      const dataUrl = await QRCode.toDataURL(value, {
        type: 'image/png',
        width: size,
        margin,
        color: {
          dark: color,
          light: background,
        },
      });
      setQrDataUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'QR code generation failed');
    }
  }, [value, size, margin, color, background]);

  useEffect(() => {
    void generateQr();
  }, [generateQr]);

  if (error) {
    return (
      <div className={clsx('flex flex-col items-center justify-center p-4 bg-gray-100 rounded-lg border border-gray-200', className)}>
        <span className="text-xs text-red-600">{error}</span>
      </div>
    );
  }

  return (
    <div className={clsx('flex flex-col items-center gap-2 p-2', className)}>
      {qrDataUrl && (
        <img
          src={qrDataUrl}
          alt="QR Code"
          width={size}
          height={size}
          className="rounded bg-white shadow-sm"
          decoding="async"
        />
      )}
      {!qrDataUrl && !error && (
        <div className={`w-${Math.floor(size / 4)} h-${Math.floor(size / 4)} bg-gray-200 rounded animate-pulse`} />
      )}
    </div>
  );
}
