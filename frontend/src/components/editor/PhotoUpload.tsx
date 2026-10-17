import React, { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from '../../i18n/I18nContext';

interface PhotoUploadProps {
  onPhotoSelect: (file: File, dataUrl: string) => void;
  onPhotoRemove: () => void;
  currentPhoto?: string | null;
  maxBytes?: number;
  maxPixels?: number;
  allowedMimeTypes?: string[];
}

export function PhotoUpload({ 
  onPhotoSelect, 
  onPhotoRemove, 
  currentPhoto,
  maxBytes = 10 * 1024 * 1024,
  maxPixels = 40 * 1000 * 1000,
  allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp']
}: PhotoUploadProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): Promise<{ valid: boolean; error?: string; dataUrl?: string }> => {
    return new Promise((resolve) => {
      if (!allowedMimeTypes.includes(file.type)) {
        resolve({ valid: false, error: 'Invalid file type. Please use JPEG, PNG, or WebP.' });
        return;
      }

      if (file.size > maxBytes) {
        resolve({ valid: false, error: `File too large. Maximum size is ${Math.round(maxBytes / 1024 / 1024)}MB.` });
        return;
      }

      const img = new Image();
      img.onload = () => {
        const pixels = img.width * img.height;
        if (pixels > maxPixels) {
          resolve({ valid: false, error: `Image dimensions too large. Maximum is ${Math.round(maxPixels / 1000000)}MP.` });
          return;
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL(file.type);
        resolve({ valid: true, dataUrl });
      };
      img.onerror = () => {
        resolve({ valid: false, error: 'Failed to load image. Please try another file.' });
      };
      img.src = URL.createObjectURL(file);
    });
  }, [allowedMimeTypes, maxBytes, maxPixels]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    setIsProcessing(true);
    setError(null);
    
    const file = acceptedFiles[0];
    const result = await validateFile(file);
    
    if (result.valid && result.dataUrl) {
      onPhotoSelect(file, result.dataUrl);
    } else {
      setError(result.error || 'Invalid file');
    }
    
    setIsProcessing(false);
  }, [validateFile, onPhotoSelect]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
    maxFiles: 1,
    disabled: isProcessing,
  });

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsProcessing(true);
    setError(null);
    
    const result = await validateFile(file);
    
    if (result.valid && result.dataUrl) {
      onPhotoSelect(file, result.dataUrl);
    } else {
      setError(result.error || 'Invalid file');
    }
    
    setIsProcessing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemove = () => {
    onPhotoRemove();
    setError(null);
  };

  if (currentPhoto) {
    return (
      <div className="relative group">
        <div
          {...getRootProps()}
          className={`
            relative aspect-square overflow-hidden rounded-lg border-2 border-dashed transition-colors
            ${isDragActive ? 'border-brand-primary bg-brand-primary/5' : 'border-gray-300 hover:border-brand-primary bg-gray-50/50'}
          `}
          role="button"
          tabIndex={0}
          aria-label="Replace photo"
        >
          <img
            src={currentPhoto}
            alt="Current uploaded photo"
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-black/60 text-white px-4 py-2 rounded-lg text-sm font-medium backdrop-blur-sm">
              {t('editor.replacePhoto')}
            </div>
          </div>
          <button
            onClick={handleRemove}
            className="absolute top-2 right-2 px-3 py-1 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors shadow-lg"
            aria-label="Remove Photo"
          >
            {t('editor.removePhoto')}
          </button>
          <input {...getInputProps()} ref={fileInputRef} onChange={handleFileInputChange} style={{ display: 'none' }} />
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={`
          relative aspect-square border-2 border-dashed rounded-lg flex flex-col items-center justify-center 
          transition-colors cursor-pointer
          ${isDragActive ? 'border-brand-primary bg-brand-primary/5' : 'border-gray-300 hover:border-brand-primary'}
        `}
        role="button"
        tabIndex={0}
        aria-label="Upload photo"
      >
        <input {...getInputProps()} ref={fileInputRef} onChange={handleFileInputChange} />
        
        <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        
        <p className="mt-2 text-center px-4 text-gray-600">
          {isDragActive 
            ? 'Drop photo here...' 
            : 'Click or drag & drop to upload a photo'
          }
        </p>
        <p className="text-xs text-gray-500 mt-1">JPEG, PNG, WebP · Max 10MB · Max 40MP</p>
      </div>
      
      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>
      )}
      
      {isProcessing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg flex items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
            <span>Processing image...</span>
          </div>
        </div>
      )}
    </div>
  );
}