import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { useAuthStore, useProjectStore, useTemplateStore } from '../store';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Layout } from '../components/layout/Layout';
import { useTranslation } from '../i18n/I18nContext';
import { TemplateVersion, TemplateCategory, CampaignPack, Project } from '@deltadp/shared';

export function Templates() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, isGuest, setGuestMode } = useAuthStore();
  const { request, loading } = useApi();
  const { addToast } = useToast();
  const { setTemplates, setPacks, packs, templates, getTemplatesByCategory } = useTemplateStore();
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [apiError, setApiError] = useState<string | null>(null);

  // Preview modal state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateVersion | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setApiError(null);
    const pack = await request<CampaignPack>('GET', '/packs');

    if (!pack) {
      setApiError('Failed to load templates. Please try again.');
      return;
    }

    // /api/packs returns one CampaignPack, not CampaignPack[].
    const availablePacks = [pack];

    setPacks(availablePacks);
    setSelectedPackId(pack.id);

    // The pack response already contains its templates and versions.
    const allVersions: TemplateVersion[] = pack.templates.flatMap(
      (template) =>
        template.versions.map((version: TemplateVersion) => ({
          ...version,
          templateId: template.id,
          packId: pack.id,
        }))
    );

    setTemplates(allVersions);
  };

  const handleRetry = () => {
    loadData();
  };

  // "all" is a UI-only value and must not be matched against a template category.
  const categoryTemplates =
    selectedCategory === 'all' ? templates : getTemplatesByCategory(selectedCategory);

  const filteredTemplates = categoryTemplates.filter(t => {
    if (searchQuery && !t.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const handleCreateProject = async (template: TemplateVersion) => {
    if (!user && !isGuest) {
      setGuestMode();
      addToast({ message: t('templates.continuingGuest'), type: 'info' });
    }

    // The pack id must be the id of the campaign pack that owns the template;
    // the backend resolves the pack from this value when rendering.
    const owningPack =
      packs.find((p) => p.templates.some((t) => t.id === template.templateId)) ??
      packs[0];
    const packId = template.packId ?? owningPack?.id;

    if (!packId) {
      addToast({ message: t('templates.failedCreateProject'), type: 'error' });
      return;
    }

    const projectData = {
      packId,
      templateId: template.templateId,
      templateVersion: template.version,
      templateSnapshot: template,
      photoUrl: null,
      photoTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, flipX: false, flipY: false },
      textValues: {},
      editorState: { zoom: 1, panX: 0, panY: 0, selectedLayerId: null, showGrid: false, snapToGrid: true },
      exportSettings: { presetId: 'instagram-square', format: 'png' as const, quality: 90, includeDisclaimer: true },
    };

    try {
      let project;
      if (user) {
        project = await request<Project>('POST', '/projects', projectData);
      } else {
        // Guest mode - create local project
        project = { ...projectData, id: `guest-${Date.now()}`, userId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as any;
        const { addProject, saveGuestProjects, loadGuestProjects } = useProjectStore.getState();
        addProject(project);
        const guestProjects = loadGuestProjects();
        saveGuestProjects([...guestProjects, project]);
      }
      if (project) {
        navigate(`/editor/${project.id}`);
      }
    } catch (err) {
      addToast({ message: err instanceof Error ? err.message : t('templates.failedCreateProject'), type: 'error' });
    }
  };

  const handlePreview = async (template: TemplateVersion) => {
    setPreviewTemplate(template);
    setPreviewImage(null);
    setPreviewLoading(true);
    setPreviewOpen(true);

    try {
      const data = await request<{ dataUrl: string; width: number; height: number }>(
        'POST',
        '/preview',
        {
          templateId: template.templateId,
          templateVersion: template.version,
          textValues: {},
          includeDisclaimer: true,
        }
      );
      if (data) {
        setPreviewImage(data.dataUrl);
      }
    } catch (err) {
      addToast({
        message: err instanceof Error ? err.message : t('templates.failedPreview'),
        type: 'error',
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const getCategoryLabel = (category: TemplateCategory | 'all'): string => {
    if (category === 'all') return t('common.all');
    return t(`templates.category.${category}`);
  };

  const pack = packs[0];

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error state */}
        {apiError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-3">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <div>
              <h3 className="font-medium text-red-900">{t('templates.errorTitle')}</h3>
              <p className="text-sm text-red-700">{apiError}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleRetry}>
              {t('common.retry')}
            </Button>
          </div>
        )}

        {/* Header with brand visibility */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {pack && pack.brand.lockup && (
                <img
                  src={pack.brand.lockup.url}
                  alt={`${pack.name} logo`}
                  className="w-10 h-10 rounded-lg object-contain border border-gray-200"
                />
              )}
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{t('templates.title')}</h1>
                <p className="text-gray-600 mt-2">
                  {t('templates.subtitle')}
                </p>
              </div>
            </div>

            {pack && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-sm">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: pack.brand.primary }} />
                  <span className="font-medium text-gray-700">{pack.name}</span>
                </div>
                <p className="text-xs text-gray-500">
                  Brand: {pack.brand.primary} · {pack.brand.secondary} · {pack.brand.accent}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
            {/* Pack selector */}
            <div className="flex-1 lg:w-64">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('templates.campaignPack')}</label>
              <select
                value={selectedPackId || ''}
                onChange={(e) => setSelectedPackId(e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent outline-none"
              >
                <option value="">{t('templates.allPacks')}</option>
                {packs.map((pack) => (
                  <option key={pack.id} value={pack.id}>{pack.name}</option>
                ))}
              </select>
            </div>

            {/* Category filter */}
            <div className="flex-1 lg:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('templates.category')}</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as TemplateCategory | 'all')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent outline-none"
              >
                <option value="all">{t('templates.allCategories')}</option>
                {(['political', 'campaign', 'community', 'youth', 'business', 'event', 'celebration', 'awareness', 'culture', 'custom'] as TemplateCategory[]).map((key) => (
                  <option key={key} value={key}>{getCategoryLabel(key)}</option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div className="flex-1 lg:w-64">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('templates.search')}</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('templates.searchPlaceholder')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent outline-none"
              />
            </div>

            {/* View mode */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">{t('templates.view')}:</label>
              <div className="flex border border-gray-300 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-2 transition-colors ${viewMode === 'grid' ? 'bg-brand-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  aria-label={t('templates.gridView')}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-2 transition-colors ${viewMode === 'list' ? 'bg-brand-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  aria-label={t('templates.listView')}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Templates Grid/List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-primary mx-auto"></div>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-2 text-lg font-medium text-gray-900">{t('templates.noTemplatesFound')}</h3>
            <p className="mt-1 text-gray-500">{t('templates.adjustFilters')}</p>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6' : 'space-y-4'}>
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onCreateProject={handleCreateProject}
                onPreview={handlePreview}
                viewMode={viewMode}
                getCategoryLabel={getCategoryLabel}
              />
            ))}
          </div>
        )}

        {/* Preview Modal */}
        <Modal isOpen={previewOpen} onClose={() => setPreviewOpen(false)} title={previewTemplate ? previewTemplate.name : t('templates.preview')}>
          <div className="flex flex-col items-center gap-4 min-h-[400px]">
            {previewLoading ? (
              <div className="flex flex-col items-center gap-2 py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-primary"></div>
                <p className="text-sm text-gray-600">{t('templates.generatingPreview')}</p>
              </div>
            ) : previewImage ? (
              <img
                src={previewImage}
                alt={`Preview of ${previewTemplate?.name}`}
                className="max-w-full max-h-[60vh] rounded-lg border border-gray-200 shadow-lg bg-white"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
                <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm">{t('templates.previewUnavailable')}</p>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{t('templates.canvas')}: {previewTemplate?.canvas.width}×{previewTemplate?.canvas.height}px</span>
              <span>·</span>
              <span>v{previewTemplate?.version}</span>
            </div>
            {previewTemplate && (
              <Button variant="outline" onClick={() => handleCreateProject(previewTemplate)} className="w-auto">
                {t('templates.useTemplate')}
              </Button>
            )}
          </div>
        </Modal>
      </div>
    </Layout>
  );
}

interface TemplateCardProps {
  template: TemplateVersion;
  onCreateProject: (template: TemplateVersion) => void;
  onPreview: (template: TemplateVersion) => void;
  viewMode: 'grid' | 'list';
  getCategoryLabel: (category: TemplateCategory | 'all') => string;
}

function TemplateCard({ template, onCreateProject, onPreview, viewMode, getCategoryLabel }: TemplateCardProps) {
  const { t } = useTranslation();
  const categoryColors: Record<string, string> = {
    political: 'bg-blue-100 text-blue-800',
    campaign: 'bg-red-100 text-red-800',
    community: 'bg-green-100 text-green-800',
    youth: 'bg-purple-100 text-purple-800',
    business: 'bg-indigo-100 text-indigo-800',
    event: 'bg-orange-100 text-orange-800',
    celebration: 'bg-pink-100 text-pink-800',
    awareness: 'bg-yellow-100 text-yellow-800',
    culture: 'bg-teal-100 text-teal-800',
    custom: 'bg-gray-100 text-gray-800',
  };

  if (viewMode === 'list') {
    return (
      <Card className="flex flex-row items-center gap-4 p-4 hover:shadow-md transition-shadow">
        <div className="w-24 h-24 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden relative">
          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900 truncate">{template.name}</h3>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${categoryColors[template.category] || 'bg-gray-100 text-gray-800'}`}>
              {getCategoryLabel(template.category)}
            </span>
            {!template.isPublished && (
              <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">
                {t('templates.draft')}
              </span>
            )}
            <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">
              v{template.version}
            </span>
          </div>
          <p className="text-sm text-gray-500 truncate">
            {t('templates.canvas')}: {template.canvas.width}×{template.canvas.height}px · {template.layers.length} {t('editor.layers')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onPreview(template)}>
            {t('templates.preview')}
          </Button>
          <Button variant="primary" size="sm" onClick={() => onCreateProject(template)} className="flex-shrink-0">
            {t('templates.useTemplate')}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col hover:shadow-lg transition-shadow group">
      <div className="aspect-square relative bg-gray-100 overflow-hidden">
        <img
          src={`/api/templates/${template.templateId}/thumbnail?version=${template.version}`}
          alt={`Preview of ${template.name}`}
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 p-4">
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="absolute top-2 right-2">
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${categoryColors[template.category] || 'bg-gray-100 text-gray-800'}`}>
            {getCategoryLabel(template.category)}
          </span>
        </div>
        {!template.isPublished && (
          <div className="absolute top-2 left-2">
            <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">
              {t('templates.draft')}
            </span>
          </div>
        )}
      </div>
      <CardContent className="flex-1 flex flex-col p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-900 line-clamp-1">{template.name}</h3>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
          <span>v{template.version}</span>
          <span>·</span>
          <span>{template.canvas.width}×{template.canvas.height}</span>
          <span>·</span>
          <span>{template.layers.length} {t('editor.layers')}</span>
        </div>
        <div className="flex flex-wrap gap-1 mb-4">
          {template.layers.slice(0, 3).map((layer) => (
            <span key={layer.id} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
              {layer.type}
            </span>
          ))}
          {template.layers.length > 3 && (
            <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
              +{template.layers.length - 3} {t('templates.more')}
            </span>
          )}
        </div>
        <div className="flex gap-2 mt-auto">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onPreview(template)}>
            {t('templates.preview')}
          </Button>
          <Button variant="primary" size="sm" className="flex-1" onClick={() => onCreateProject(template)}>
            {t('templates.useTemplate')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
