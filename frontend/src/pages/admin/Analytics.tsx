import React, { useEffect, useState } from 'react';
import { Layout } from '../../components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { useApi } from '../../hooks/useApi';
import { useTranslation } from '../../i18n/I18nContext';

interface AnalyticsSummary {
  totalEvents: number;
  eventsByEvent: { event: string; count: number }[];
  uniqueUsers: number;
}

export function Analytics() {
  const { t } = useTranslation();
  const { request, loading } = useApi();
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    void loadAnalytics();
  }, [request]);

  const loadAnalytics = async () => {
    const data = await request<AnalyticsSummary>('GET', '/admin/analytics');
    if (data) {
      setAnalytics(data);
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {t('admin.analytics')}
        </h1>
        <p className="text-gray-600 mb-8">
          {t('admin.analyticsDescription')}
        </p>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-primary mx-auto" />
          </div>
        ) : (
      <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">{t('admin.totalEvents')}</p>
              <p className="text-3xl font-bold text-gray-900">
                {analytics?.totalEvents ?? 0}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">{t('admin.uniqueUsers')}</p>
              <p className="text-3xl font-bold text-gray-900">
                {analytics?.uniqueUsers ?? 0}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">
                {t('admin.topEventTypes')}
              </p>
              <p className="text-3xl font-bold text-gray-900">
                {analytics?.eventsByEvent.length ?? 0}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('admin.eventsByType')}</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics?.eventsByEvent.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                {t('admin.noAnalyticsData')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-3 text-sm font-semibold text-gray-600">
                        {t('admin.event')}
                      </th>
                      <th className="px-4 py-3 text-sm font-semibold text-gray-600 text-right">
                        {t('admin.count')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics?.eventsByEvent?.map((item) => (
                      <tr key={item.event} className="border-b border-gray-100">
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {item.event}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                          {item.count}
                        </td>
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
