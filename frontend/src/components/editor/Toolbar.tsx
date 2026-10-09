import React from 'react';
import { useTranslation } from '../../i18n/I18nContext';

interface ToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  zoom: number;
  onToggleGrid: () => void;
  showGrid: boolean;
  onToggleSnap: () => void;
  snapToGrid: boolean;
  onExport: () => void;
  onSave: () => void;
  isSaving: boolean;
  isExporting: boolean;
  readonly?: boolean;
}

export function Toolbar({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  zoom,
  onToggleGrid,
  showGrid,
  onToggleSnap,
  snapToGrid,
  onExport,
  onSave,
  isSaving,
  isExporting,
  readonly = false,
}: ToolbarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-white border-b border-gray-200">
      {/* Undo/Redo */}
      <div className="flex items-center gap-1 border-r border-gray-200 pr-3">
        <button
          onClick={onUndo}
          disabled={!canUndo || readonly}
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo || readonly}
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Redo"
          title="Redo (Ctrl+Y)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
          </svg>
        </button>
      </div>

      {/* Zoom controls */}
      <div className="flex items-center gap-1 border-r border-gray-200 pr-3">
        <button
          onClick={onZoomOut}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Zoom out"
          title="Zoom Out (-)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
        <span className="px-2 text-sm text-gray-600 min-w-[50px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={onZoomIn}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Zoom in"
          title="Zoom In (+)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
        <button
          onClick={onResetZoom}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Reset zoom"
          title="Reset Zoom (0)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </button>
      </div>

      {/* Grid & Snap */}
      <div className="flex items-center gap-2 border-r border-gray-200 pr-3">
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showGrid}
              onChange={onToggleGrid}
              className="rounded border-gray-300 text-brand-primary focus:ring-brand-primary"
            />
            {t('toolbar.grid')}
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={snapToGrid}
              onChange={onToggleSnap}
              className="rounded border-gray-300 text-brand-primary focus:ring-brand-primary"
            />
            {t('toolbar.snap')}
        </label>
      </div>

      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-2">
        {readonly ? (
          <span className="text-sm text-gray-500">{t('toolbar.viewOnly')}</span>
        ) : (
          <>
            <button
              onClick={onSave}
              disabled={isSaving}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors font-medium"
            >
              {isSaving ? t('toolbar.saving') : t('toolbar.saveProject')}
            </button>
            <button
              onClick={onExport}
              disabled={isExporting}
              className="px-4 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-primary/90 disabled:opacity-50 transition-colors font-medium"
            >
              {isExporting ? t('toolbar.exporting') : t('toolbar.export')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}