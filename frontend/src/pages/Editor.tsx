import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { useAuthStore, useProjectStore } from '../store';
import { Layout } from '../components/layout/Layout';
import { CanvasEditor } from '../components/editor/CanvasEditor';
import { PhotoUpload } from '../components/editor/PhotoUpload';
import { Toolbar } from '../components/editor/Toolbar';
import { ShareDialog } from '../components/sharing/ShareDialog';
import { Button } from '../components/ui/Button';
import { useTranslation } from '../i18n/I18nContext';
import { TemplateVersion, PhotoTransform, EditorState, ExportSettings, Project, CampaignPack } from '@deltadp/shared';
import { EXPORT_PRESETS } from '@deltadp/shared';

interface EditorProject extends Project {
  templateSnapshot: TemplateVersion;
}

export function Editor() {
  const { projectId } = useParams<{ projectId: string }>();
  const { isGuest, setGuestProject } = useAuthStore();
  const updateProject = useProjectStore((s) => s.updateProject);
  const { t } = useTranslation();
  const [project, setProject] = useState<EditorProject | null>(null);
  const [textValues, setTextValues] = useState<Record<string, string>>({});
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoTransform, setPhotoTransform] = useState<PhotoTransform>({
    x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, flipX: false, flipY: false,
  });
  const [editorState, setEditorState] = useState<EditorState>({
    zoom: 1, panX: 0, panY: 0, selectedLayerId: null, showGrid: false, snapToGrid: true,
  });
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    presetId: 'instagram-square', format: 'png', quality: 90, includeDisclaimer: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [history, setHistory] = useState<{ textValues: Record<string, string>; photoTransform: PhotoTransform }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [pack, setPack] = useState<CampaignPack | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [entitlementBlocked, setEntitlementBlocked] = useState(false);
  const { request, loading, upload, getLastError } = useApi();
  const { addToast } = useToast();
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  const saveToHistory = useCallback((newTextValues: Record<string, string>, newPhotoTransform: PhotoTransform) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push({ textValues: newTextValues, photoTransform: newPhotoTransform });
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const state = history[newIndex];
      setTextValues(state.textValues);
      setPhotoTransform(state.photoTransform);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const state = history[newIndex];
      setTextValues(state.textValues);
      setPhotoTransform(state.photoTransform);
    }
  }, [history, historyIndex]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  useEffect(() => {
    if (projectId) {
      loadProject(projectId);
    }
  }, [projectId]);

  const loadProject = async (id: string) => {
    // Guest projects live in local storage only; they have no server record.
    if (id.startsWith('guest-')) {
      const local = useProjectStore
        .getState()
        .projects.find((p) => p.id === id);
      if (local) {
        applyProject(local as EditorProject);
      }
      return;
    }

    const data = await request<EditorProject>('GET', `/projects/${id}`);
    if (data) {
      applyProject(data);
    }
  };

  const applyProject = (data: EditorProject) => {
    setProject(data);
    setTextValues(data.textValues);
    setPhotoUrl(data.photoUrl);
    setPhotoTransform(data.photoTransform || { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, flipX: false, flipY: false });
    setEditorState(data.editorState || { zoom: 1, panX: 0, panY: 0, selectedLayerId: null, showGrid: false, snapToGrid: true });
    setExportSettings(data.exportSettings || { presetId: 'instagram-square', format: 'png', quality: 90, includeDisclaimer: true });
    setHistory([{ textValues: data.textValues, photoTransform: data.photoTransform || { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, flipX: false, flipY: false } }]);
    setHistoryIndex(0);
  };

  // Load the default campaign pack for share targets
  useEffect(() => {
    void (async () => {
      const data = await request<CampaignPack>('GET', '/packs');
      if (data) setPack(data);
    })();
  }, [request]);

  const handleTextChange = useCallback((layerId: string, value: string) => {
    setTextValues(prev => {
      const newValues = { ...prev, [layerId]: value };
      saveToHistory(newValues, photoTransform);
      return newValues;
    });
  }, [photoTransform, saveToHistory]);

  const handlePhotoTransformChange = useCallback((transform: Partial<PhotoTransform>) => {
    setPhotoTransform((prev) => {
      const newTransform = { ...prev, ...transform };
      saveToHistory(textValues, newTransform);
      return newTransform;
    });
  }, [textValues, saveToHistory]);

  const handlePhotoSelect = useCallback(async (file: File, dataUrl: string) => {
    setPhotoUrl(dataUrl);
    const newTransform = { ...photoTransform, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, flipX: false, flipY: false };
    setPhotoTransform(newTransform);
    saveToHistory(textValues, newTransform);

    const result = await upload(file);
    if (result) {
      setPhotoUrl(result.url);
      addToast({ message: t('editor.photoUploaded'), type: 'success' });
    }
  }, [photoTransform, textValues, saveToHistory, upload, addToast]);

  const handlePhotoRemove = useCallback(() => {
    setPhotoUrl(null);
    const newTransform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, flipX: false, flipY: false };
    setPhotoTransform(newTransform);
    saveToHistory(textValues, newTransform);
  }, [textValues, saveToHistory]);

  const handleRotateLeft = useCallback(() => {
    setPhotoTransform((prev) => {
      const newTransform = { ...prev, rotation: prev.rotation - 90 };
      saveToHistory(textValues, newTransform);
      return newTransform;
    });
  }, [textValues, saveToHistory]);

  const handleRotateRight = useCallback(() => {
    setPhotoTransform((prev) => {
      const newTransform = { ...prev, rotation: prev.rotation + 90 };
      saveToHistory(textValues, newTransform);
      return newTransform;
    });
  }, [textValues, saveToHistory]);

  const handleFlipHorizontal = useCallback(() => {
    setPhotoTransform((prev) => {
      const newTransform = { ...prev, flipX: !prev.flipX };
      saveToHistory(textValues, newTransform);
      return newTransform;
    });
  }, [textValues, saveToHistory]);

  const handleFlipVertical = useCallback(() => {
    setPhotoTransform((prev) => {
      const newTransform = { ...prev, flipY: !prev.flipY };
      saveToHistory(textValues, newTransform);
      return newTransform;
    });
  }, [textValues, saveToHistory]);

  const handleResetPosition = useCallback(() => {
    const newTransform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, flipX: false, flipY: false };
    setPhotoTransform(newTransform);
    saveToHistory(textValues, newTransform);
  }, [textValues, saveToHistory]);

  const handleZoomIn = useCallback(() => {
    setEditorState(prev => ({ ...prev, zoom: Math.min(prev.zoom + 0.25, 3) }));
  }, []);

  const handleZoomOut = useCallback(() => {
    setEditorState(prev => ({ ...prev, zoom: Math.max(prev.zoom - 0.25, 0.25) }));
  }, []);

  const handleResetZoom = useCallback(() => {
    setEditorState(prev => ({ ...prev, zoom: 1 }));
  }, []);

  const handleToggleGrid = useCallback(() => {
    setEditorState(prev => ({ ...prev, showGrid: !prev.showGrid }));
  }, []);

  const handleToggleSnap = useCallback(() => {
    setEditorState(prev => ({ ...prev, snapToGrid: !prev.snapToGrid }));
  }, []);

  const handleExport = async () => {
    if (!project) return;
    setIsExporting(true);
    try {
      const preset = EXPORT_PRESETS.find(p => p.id === exportSettings.presetId);
      if (!preset) throw new Error('Invalid preset');
      
      const data = await request<{ generationId: string; url: string }>('POST', '/generate', {
        projectId: project.id,
        packId: project.packId,
        templateId: project.templateId,
        templateVersion: project.templateVersion,
        photoUrl,
        photoTransform,
        textValues,
        presetId: exportSettings.presetId,
        format: exportSettings.format,
        quality: exportSettings.quality,
        includeDisclaimer: exportSettings.includeDisclaimer,
        saveProject: true,
        organizationId: (project as { organizationId?: string }).organizationId ?? undefined,
      });
      if (data) {
        setGeneratedImage(data.url);
        setGenerationId(data.generationId);
        setShareOpen(true);
        addToast({ message: t('editor.imageGenerated'), type: 'success' });
        setEntitlementBlocked(false);
        return;
      }

      // The request hook returns null on failure; read the real reason so the
      // user is told what actually went wrong.
      const failure = getLastError();
      const message = failure?.message || t('editor.exportFailed');

      if (failure && /limit exceeded/i.test(message)) {
        setEntitlementBlocked(true);
        return;
      }

      addToast({ message, type: 'error' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleSave = async () => {
    if (!project) return;
    setIsSaving(true);
    try {
      const nextState = {
        textValues,
        photoUrl,
        photoTransform,
        editorState,
        exportSettings,
      };

      // Guest projects have no server record: persist them locally only.
      if (isGuest || project.id.startsWith('guest-')) {
        setGuestProject({
          ...project,
          ...nextState,
          updatedAt: new Date().toISOString(),
        });
        updateProject(project.id, nextState);
        return;
      }

      await request('PUT', `/projects/${project.id}`, nextState);
      addToast({ message: t('editor.projectSaved'), type: 'success' });
    } catch (err) {
      addToast({ message: err instanceof Error ? err.message : t('editor.saveFailed'), type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(handleSave, 2000);
  }, [handleSave]);

  // Auto-save on changes
  useEffect(() => {
    if (project && !isSaving) {
      debouncedSave();
    }
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [textValues, photoUrl, photoTransform, editorState, exportSettings, project, isSaving, debouncedSave]);

  if (loading || !project) {
    return (
      <Layout>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('editor.loading')}</p>
        </div>
      </Layout>
    );
  }

  const shareTitle = project.templateSnapshot.name || t('editor.shareImage');
  const shareText = pack?.disclaimer || '';

  return (
    <Layout>
      <div className="h-screen flex flex-col bg-gray-50">
        <Toolbar
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetZoom={handleResetZoom}
          zoom={editorState.zoom}
          onToggleGrid={handleToggleGrid}
          showGrid={editorState.showGrid}
          onToggleSnap={handleToggleSnap}
          snapToGrid={editorState.snapToGrid}
          onExport={handleExport}
          onSave={handleSave}
          isSaving={isSaving}
          isExporting={isExporting}
          onRotateLeft={handleRotateLeft}
          onRotateRight={handleRotateRight}
          onFlipHorizontal={handleFlipHorizontal}
          onFlipVertical={handleFlipVertical}
          onResetPosition={handleResetPosition}
          hasPhoto={!!photoUrl}
        />

        {entitlementBlocked && (
          <div className="p-4 bg-amber-50 border border-amber-200">
            <div className="flex items-start gap-3">
              <div className="shrink-0 mt-1">
                <svg className="h-5 w-5 text-amber-700" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.542 2.98-1.556 0-2.302-1.466-1.754-2.67l-2.893-4.99-2.893 4.99c.548 1.204-.198 2.67-1.754 2.67-1.33 0-2.292-1.646-1.543-2.98l5.58-9.92zM9 12a1 1 0 11-2 0 1 1 0 012 0zm-1 4a1 1 0 100 2 1 1 0 000-2zm7-1a1 1 0 011 1v3a1 1 0 11-2 0v-3a1 1 0 011-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-amber-800">{t('entitlement.limitReached')}</h3>
                <p className="text-sm text-amber-700 mt-1">
                  {t('entitlement.upgradeToContinue')}
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="primary" size="sm" onClick={() => window.location.href = '/pricing'}>
                Upgrade Plan
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEntitlementBlocked(false)}>
                Dismiss
              </Button>
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-gray-50">
          {/* Left sidebar - Photo upload & export settings (stacked on mobile) */}
          <aside className="w-full md:w-72 bg-white border-r border-gray-200 md:border-r-0 border-b-0 md:border-b border-gray-200 p-4 overflow-y-auto flex-shrink-0 md:flex-shrink-0">
            <div className="space-y-6">
              <div>
                <h3 className="font-medium text-gray-900 mb-3">{t('editor.photo')}</h3>
                <PhotoUpload
                  onPhotoSelect={handlePhotoSelect}
                  onPhotoRemove={handlePhotoRemove}
                  currentPhoto={photoUrl}
                />
              </div>

              <div>
                <h3 className="font-medium text-gray-900 mb-3">{t('editor.exportSettings')}</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('editor.preset')}</label>
                    <select
                      value={exportSettings.presetId}
                      onChange={(e) => setExportSettings(prev => ({ ...prev, presetId: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent outline-none"
                    >
                      {EXPORT_PRESETS.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.width}×{p.height})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('editor.format')}</label>
                    <select
                      value={exportSettings.format}
                      onChange={(e) => setExportSettings(prev => ({ ...prev, format: e.target.value as 'png' | 'jpg' | 'webp' }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent outline-none"
                    >
                      <option value="png">PNG</option>
                      <option value="jpg">JPG</option>
                      <option value="webp">WebP</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('editor.quality')}: {exportSettings.quality}%</label>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={exportSettings.quality}
                      onChange={(e) => setExportSettings(prev => ({ ...prev, quality: parseInt(e.target.value, 10) }))}
                      className="w-full"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportSettings.includeDisclaimer}
                      onChange={(e) => setExportSettings(prev => ({ ...prev, includeDisclaimer: e.target.checked }))}
                      className="rounded border-gray-300 text-brand-primary focus:ring-brand-primary"
                    />
                    {t('editor.includeDisclaimer')}
                  </label>
                </div>
              </div>

              <div>
                <h3 className="font-medium text-gray-900 mb-3">{t('editor.canvasInfo')}</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>{t('editor.size')}: {project.templateSnapshot.canvas.width} × {project.templateSnapshot.canvas.height}px</p>
                  <p>{t('editor.photoZone')}: {project.templateSnapshot.photoZone.shape}</p>
                  <p>{t('editor.layers')}: {project.templateSnapshot.layers.length}</p>
                </div>
              </div>
            </div>
          </aside>

          {/* Canvas area */}
          <main className="flex-1 flex flex-col overflow-auto p-6 md:p-8 bg-gray-100 min-h-[400px]">
            <div className="flex justify-center">
              <div className="relative" style={{ transform: `scale(${editorState.zoom})`, transformOrigin: 'top center' }}>
                <CanvasEditor
                  template={project.templateSnapshot}
                  photoUrl={photoUrl}
                  textValues={textValues}
                  photoTransform={photoTransform}
                  onTextChange={handleTextChange}
                  onPhotoTransformChange={handlePhotoTransformChange}
                  showGrid={editorState.showGrid}
                  snapToGrid={editorState.snapToGrid}
                />
              </div>
            </div>

            {/* Mobile photo transform controls (prominent touch targets) */}
            {photoUrl && (
              <div className="md:hidden mt-4 flex flex-wrap justify-center gap-2">
                <button
                  onClick={handleRotateLeft}
                  className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                  aria-label="Rotate Left"
                >
                  {t('editor.rotateLeft')}
                </button>
                <button
                  onClick={handleRotateRight}
                  className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                  aria-label="Rotate Right"
                >
                  {t('editor.rotateRight')}
                </button>
                <button
                  onClick={handleFlipHorizontal}
                  className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                  aria-label="Flip Horizontal"
                >
                  {t('editor.flipHorizontal')}
                </button>
                <button
                  onClick={handleFlipVertical}
                  className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                  aria-label="Flip Vertical"
                >
                  {t('editor.flipVertical')}
                </button>
                <button
                  onClick={handleResetPosition}
                  className="px-4 py-2.5 bg-white border border-red-200 rounded-lg text-sm font-medium text-red-700 hover:bg-red-50 transition-colors shadow-sm"
                  aria-label="Reset Position"
                >
                  {t('editor.resetPosition')}
                </button>
              </div>
            )}
          </main>

          {/* Right sidebar - Text layer controls (hidden on mobile) */}
          <aside className="hidden md:flex w-72 bg-white border-l border-gray-200 p-4 overflow-y-auto flex-shrink-0">
            <h3 className="font-medium text-gray-900 mb-3">{t('editor.textLayers')}</h3>
            <div className="space-y-4">
              {project.templateSnapshot.layers
                .filter(layer => layer.type === 'text')
                .map((layer) => (
                  <div key={layer.id}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {layer.text || layer.id}
                    </label>
                    <textarea
                      value={textValues[layer.id] || layer.text || ''}
                      onChange={(e) => handleTextChange(layer.id, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent outline-none text-sm"
                      rows={3}
                      placeholder={t('editor.enterText')}
                    />
                  </div>
                ))}
              {project.templateSnapshot.layers.filter(l => l.type === 'text').length === 0 && (
                <p className="text-sm text-gray-500">{t('editor.noTextLayers')}</p>
              )}
            </div>
          </aside>
        </div>
      </div>

      <ShareDialog
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        pack={pack}
        title={shareTitle}
        text={shareText}
        url={generatedImage || ''}
        imageUrl={generatedImage || undefined}
        generationId={generationId || undefined}
      />
    </Layout>
  );
}
