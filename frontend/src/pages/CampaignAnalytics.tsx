import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { useApi } from '../hooks/useApi';
import { useTranslation } from '../i18n/I18nContext';

interface AnalyticsStats {
  totalEvents: number;
  eventsByEvent: Array<{ event: string; count: number }>;
  uniqueUsers: number;
  generationsByFormat: Array<{ format: string; count: number }>;
  generationsByPreset: Array<{ presetId: string; count: number }>;
  sharesByPlatform: Array<{ platform: string; count: number }>;
  downloadsByFormat: Array<{ format: string; count: number }>;
  recentActivity: Array<{
    id: string;
    event: string;
    properties: string;
    timestamp: string;
    userId: string | null;
  }>;
}

interface AnalyticsScope {
  organizationId: string;
  campaignId?: string;
}

export function CampaignAnalytics() {
  const { t } = useTranslation();
  const { request, loading } = useApi();
  const { organizationId, campaignId } = useParams<{ organizationId?: string; campaignId?: string }>();

  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [scope, setScope] = useState<AnalyticsScope>({ organizationId: organizationId ?? '' });

  useEffect(() => {
    if (!organizationId) return;
    setScope({ organizationId, campaignId: campaignId ?? undefined });
    void loadAnalytics();
  }, [organizationId, campaignId, request]);

  const loadAnalytics = async () => {
    const path = scope.campaignId
      ? `/organizations/${encodeURIComponent(scope.organizationId)}/campaigns/${encodeURIComponent(scope.campaignId)}/analytics`
      : `/organizations/${encodeURIComponent(scope.organizationId)}/analytics`;
    const data = await request<AnalyticsStats>('GET', path);
    if (data) setStats(data);
  };

  if (!organizationId) return null;

  const totalGenerations = stats?.generationsByFormat.reduce((sum, g) => sum + g.count, 0) ?? 0;
  const totalShares = stats?.sharesByPlatform.reduce((sum, s) => sum + s.count, 0) ?? 0;
  const totalDownloads = stats?.downloadsByFormat.reduce((sum, d) => sum + d.count, 0) ?? 0;
  const totalTemplatesUsed = stats?.eventsByEvent.filter(e => e.event === 'template_use').reduce((sum, e) => sum + e.count, 0) ?? 0;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {t('analytics.title')}
            </h1>
            <p className="text-gray-600 mt-1">
              {t('analytics.subtitle')}
            </p>
          </div>
          <div className="flex gap-2">
            <Link to={`/dashboard/${organizationId}`}>
              <Button variant="outline" size="sm">
                {t('dashboard.backToOrg')}
              </Button>
            </Link>
            {campaignId && (
              <Link to={`/dashboard/${organizationId}/${campaignId}`}>
                <Button variant="outline" size="sm">
                  {t('dashboard.backToOrg')}
                </Button>
              </Link>
            )}
          </div>
        </div>

        <div className="text-xs text-gray-500 mb-6">
          <span className={`font-medium ${scope.campaignId ? 'text-brand-primary' : 'text-gray-700'}`}>
            {scope.campaignId ? t('analytics.campaignScope') : t('analytics.orgScope')}
          </span>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-primary mx-auto" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">{t('analytics.totalEvents')}</p>
                  <p className="text-3xl font-bold text-gray-900">{stats?.totalEvents ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">{t('analytics.uniqueUsers')}</p>
                  <p className="text-3xl font-bold text-gray-900">{stats?.uniqueUsers ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">{t('analytics.generationsByFormat')}</p>
                  <p className="text-3xl font-bold text-gray-900">{totalGenerations}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">{t('analytics.sharesByPlatform')}</p>
                  <p className="text-3xl font-bold text-gray-900">{totalShares}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">{t('analytics.downloadsByFormat')}</p>
                  <p className="text-3xl font-bold text-gray-900">{totalDownloads}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">{t('analytics.templateUsage')}</p>
                  <p className="text-3xl font-bold text-gray-900">{totalTemplatesUsed}</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <Card>
                <CardHeader>
                  <CardTitle>{t('analytics.generationsByFormat')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {(stats?.generationsByFormat ?? []).length === 0 ? (
                    <p className="text-gray-500 text-center py-8">{t('analytics.noAnalyticsData')}</p>
                  ) : (
                    <div className="space-y-3">
                      {(stats?.generationsByFormat ?? []).map((item) => (
                        <div key={item.format} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{item.format.toUpperCase()}</span>
                          <span className="text-sm font-medium text-gray-900">{item.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('analytics.generationsByPreset')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {(stats?.generationsByPreset ?? []).length === 0 ? (
                    <p className="text-gray-500 text-center py-8">{t('analytics.noAnalyticsData')}</p>
                  ) : (
                    <div className="space-y-3">
                      {(stats?.generationsByPreset ?? []).map((item) => (
                        <div key={item.presetId} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{item.presetId}</span>
                          <span className="text-sm font-medium text-gray-900">{item.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <Card>
                <CardHeader>
                  <CardTitle>{t('analytics.sharesByPlatform')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {(stats?.sharesByPlatform ?? []).length === 0 ? (
                    <p className="text-gray-500 text-center py-8">{t('analytics.noAnalyticsData')}</p>
                  ) : (
                    <div className="space-y-3">
                      {(stats?.sharesByPlatform ?? []).map((item) => (
                        <div key={item.platform} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{item.platform}</span>
                          <span className="text-sm font-medium text-gray-900">{item.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('analytics.downloadsByFormat')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {(stats?.downloadsByFormat ?? []).length === 0 ? (
                    <p className="text-gray-500 text-center py-8">{t('analytics.noAnalyticsData')}</p>
                  ) : (
                    <div className="space-y-3">
                      {(stats?.downloadsByFormat ?? []).map((item) => (
                        <div key={item.format} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{item.format.toUpperCase()}</span>
                          <span className="text-sm font-medium text-gray-900">{item.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="mb-8">
              <CardHeader>
                <CardTitle>{t('analytics.recentActivity')}</CardTitle>
              </CardHeader>
              <CardContent>
                {(stats?.recentActivity ?? []).length === 0 ? (
                  <p className="text-gray-500 text-center py-8">{t('analytics.noAnalyticsData')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="px-4 py-3 text-xs font-semibold text-gray-600">
                            {t('analytics.event')}
                          </th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-600">
                            {t('analytics.created')}
                          </th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-right">
                            {t('analytics.count')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(stats?.recentActivity ?? []).map((a) => (
                          <tr key={a.id} className="border-b border-gray-100">
                            <td className="px-4 py-3 text-sm text-gray-900">{a.event}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {new Date(a.timestamp).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 text-right font-medium">1</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('analytics.eventsByType')}</CardTitle>
              </CardHeader>
              <CardContent>
                {(stats?.eventsByEvent ?? []).length === 0 ? (
                  <p className="text-gray-500 text-center py-8">{t('analytics.noAnalyticsData')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="px-4 py-3 text-xs font-semibold text-gray-600">
                            {t('analytics.event')}
                          </th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-right">
                            {t('analytics.count')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(stats?.eventsByEvent ?? []).map((item) => (
                          <tr key={item.event} className="border-b border-gray-100">
                            <td className="px-4 py-3 text-sm text-gray-600">{item.event}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">{item.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
