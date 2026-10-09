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

export function Admin() {
  const { t } = useTranslation();
  const { request, loading } = useApi();
  const { addToast } = useToast();
  const [pack, setPack] = useState<CampaignPack | null>(null);
  const [authorizedBy, setAuthorizedBy] = useState('');
  const [authorizationRef, setAuthorizationRef] = useState('');
  const [disclaimer, setDisclaimer] = useState('');
  const [saving, setSaving] = useState(false);

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
          disclaimer: disclaimer,
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

  const templates = pack?.templates ?? [];

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

        {/* Pack Templates */}
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.templatesTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">{t('admin.manageTemplates')}</p>
            {templates.length === 0 ? (
              <p className="text-gray-500 text-center py-8">{t('admin.noTemplates')}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-gray-900 truncate">{template.name}</h3>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${categoryBadge[template.category] || 'bg-gray-100 text-gray-800'}`}>
                        {t(`templates.category.${template.category}`)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      {t('templates.canvas')}: — · v{template.latestVersion}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
