import React, { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { useTranslation } from '../i18n/I18nContext';
import { CampaignPack, TemplateCategory } from '@deltadp/shared';

const categoryBadge: Record<TemplateCategory, string> = {
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

interface AdminTemplateRow {
  id: string;
  name: string;
  category: string;
  latestVersion: number;
  versions: Array<{ id: string; version: number; name: string; category: string; isPublished: boolean; createdAt: string }>;
  createdAt: string;
  updatedAt: string;
}

export function Admin() {
  const { t } = useTranslation();
  const { request, loading } = useApi();
  const { addToast } = useToast();
  const [pack, setPack] = useState<CampaignPack | null>(null);
  const [authorizedBy, setAuthorizedBy] = useState('');
  const [authorizationRef, setAuthorizationRef] = useState('');
  const [disclaimer, setDisclaimer] = useState('');
  const [saving, setSaving] = useState(false);
  // Template management (all versions, incl. drafts)
  const [adminTemplates, setAdminTemplates] = useState<AdminTemplateRow[]>([]);
  const [adminTemplatesLoading, setAdminTemplatesLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const data = await request<CampaignPack>('GET', '/packs');
      if (data) {
        setPack(data);
        setAuthorizedBy(data.authorizedBy || '');
        setAuthorizationRef(data.authorizationRef || '');
        setDisclaimer(data.disclaimer || '');
      }
    })();
  }, [request]);

  useEffect(() => {
    if (!pack) return;
    void (async () => {
      setAdminTemplatesLoading(true);
      try {
        const data = await request<AdminTemplateRow[]>(
          'GET',
          `/admin/templates?packId=${encodeURIComponent(pack.id)}`
        );
        if (data) setAdminTemplates(data);
      } finally {
        setAdminTemplatesLoading(false);
      }
    })();
  }, [pack, request]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pack) return;
    setSaving(true);
    try {
      const updated = await request<CampaignPack>(
        'PUT',
        `/admin/packs/${pack.id}/authorization`,
        {
          authorizedBy: authorizedBy.trim() || null,
          authorizationRef: authorizationRef.trim() || null,
          disclaimer,
        }
      );
      if (updated) {
        setPack(updated);
        addToast({ message: t('admin.authorizationUpdated'), type: 'success' });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async (templateId: string, version: number, isPublished: boolean) => {
    try {
      await request(
        'PUT',
        `/admin/templates/${templateId}/publish`,
        { isPublished, version }
      );
      addToast({ message: isPublished ? t('admin.templatePublished') : t('admin.templateDraft'), type: 'success' });
      // Refresh admin template list
      if (pack) {
        const data = await request<AdminTemplateRow[]>(
          'GET',
          `/admin/templates?packId=${encodeURIComponent(pack.id)}`
        );
        if (data) setAdminTemplates(data);
      }
    } catch (err) {
      addToast({ message: err instanceof Error ? err.message : t('admin.templatePublishFailed'), type: 'error' });
    }
  };

  const handleDuplicate = async (templateId: string) => {
    try {
      await request('POST', `/admin/templates/${templateId}/duplicate`);
      addToast({ message: t('admin.templateDuplicated'), type: 'success' });
      if (pack) {
        const data = await request<AdminTemplateRow[]>(
          'GET',
          `/admin/templates?packId=${encodeURIComponent(pack.id)}`
        );
        if (data) setAdminTemplates(data);
      }
    } catch (err) {
      addToast({ message: err instanceof Error ? err.message : t('admin.templateDuplicateFailed'), type: 'error' });
    }
  };

  const templates = pack?.templates ?? [];
  const latestByTemplate = new Map<string, AdminTemplateRow>();
  for (const t of adminTemplates) {
    latestByTemplate.set(t.id, t);
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('admin.title')}</h1>
        <p className="text-gray-600 mb-8">{t('admin.subtitle')}</p>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">{t('admin.packs')}</p>
              <p className="text-3xl font-bold text-gray-900">{pack ? 1 : '—'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">{t('admin.templates')}</p>
              <p className="text-3xl font-bold text-gray-900">{pack ? templates.length : '—'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">{t('admin.generations')}</p>
              <p className="text-3xl font-bold text-gray-900">—</p>
            </CardContent>
          </Card>
        </div>

        {/* Brand Identity (reusable brand model) */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>{t('admin.brandIdentity')}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-500 mb-3">{t('admin.brandColors')}</p>
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-lg border border-gray-200" style={{ backgroundColor: pack?.brand.primary }} />
                    <span className="text-xs text-gray-500 mt-1">{t('admin.brandPrimary')}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-lg border border-gray-200" style={{ backgroundColor: pack?.brand.secondary }} />
                    <span className="text-xs text-gray-500 mt-1">{t('admin.brandSecondary')}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-lg border border-gray-200" style={{ backgroundColor: pack?.brand.accent }} />
                    <span className="text-xs text-gray-500 mt-1">{t('admin.brandAccent')}</span>
                  </div>
                </div>
              </div>
              {pack?.brand.lockup && (
                <div>
                  <p className="text-sm text-gray-500 mb-3">{t('admin.brandLockup')}</p>
                  <img
                    src={pack.brand.lockup.url}
                    alt="Campaign lockup"
                    className="max-w-full max-h-32 rounded-lg border border-gray-200 bg-white"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Campaign Authorization */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>{t('admin.authorization')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">{t('admin.authorizationDescription')}</p>
            {loading || !pack ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-primary mx-auto"></div>
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-4">
                <Input
                  label={t('admin.authorizedBy')}
                  placeholder={t('admin.authorizedBy')}
                  value={authorizedBy}
                  onChange={(e) => setAuthorizedBy(e.target.value)}
                />
                <Input
                  label={t('admin.authorizationRef')}
                  placeholder={t('admin.authorizationRef')}
                  value={authorizationRef}
                  onChange={(e) => setAuthorizationRef(e.target.value)}
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('admin.disclaimer')}
                  </label>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent outline-none"
                    rows={3}
                    placeholder={t('admin.disclaimer')}
                    value={disclaimer}
                    onChange={(e) => setDisclaimer(e.target.value)}
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" variant="primary" loading={saving}>
                    {t('admin.saveChanges')}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Template Management (all versions, incl. drafts) */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>{t('admin.templateManagement')}</CardTitle>
            <div className="text-xs text-gray-500">
              {adminTemplates.filter(t => !t.versions.some(v => v.isPublished)).length} {t('admin.drafts')}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">{t('admin.manageTemplatesDescription')}</p>
            {adminTemplatesLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-primary mx-auto"></div>
              </div>
            ) : adminTemplates.length === 0 ? (
              <p className="text-gray-500 text-center py-8">{t('admin.noTemplates')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-3 text-sm font-semibold text-gray-600">{t('admin.templateName')}</th>
                      <th className="px-4 py-3 text-sm font-semibold text-gray-600">{t('admin.category')}</th>
                      <th className="px-4 py-3 text-sm font-semibold text-gray-600">{t('admin.version')}</th>
                      <th className="px-4 py-3 text-sm font-semibold text-gray-600">{t('admin.status')}</th>
                      <th className="px-4 py-3 text-sm font-semibold text-gray-600 text-right">{t('admin.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminTemplates.map((template) => {
                      const latest = template.versions[template.versions.length - 1];
                      const isPublished = latest?.isPublished ?? false;
                      return (
                        <tr key={template.id} className="border-b border-gray-100">
                          <td className="px-4 py-3 text-sm text-gray-900">{template.name}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${categoryBadge[template.category as TemplateCategory] || 'bg-gray-100 text-gray-800'}`}>
                              {t(`templates.category.${template.category as TemplateCategory}`)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">v{template.latestVersion}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${isPublished ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                              {isPublished ? t('admin.statusPublished') : t('admin.statusDraft')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleTogglePublish(template.id, template.latestVersion, !isPublished)}
                            >
                              {isPublished ? t('admin.unpublish') : t('admin.publish')}
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleDuplicate(template.id)}
                            >
                              {t('admin.duplicate')}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
