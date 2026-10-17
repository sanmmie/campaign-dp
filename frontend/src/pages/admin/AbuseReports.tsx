import React, { useEffect, useState } from 'react';
import { Layout } from '../../components/layout/Layout';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../hooks/useToast';
import { useTranslation } from '../../i18n/I18nContext';

interface AbuseReport {
  id: string;
  targetType: string;
  targetId: string;
  reporterId: string | null;
  reason: string;
  details: string | null;
  status: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  reviewed: 'bg-blue-100 text-blue-800',
  dismissed: 'bg-gray-100 text-gray-800',
  actioned: 'bg-green-100 text-green-800',
};

export function AbuseReports() {
  const { t } = useTranslation();
  const { request, loading } = useApi();
  const { addToast } = useToast();
  const [reports, setReports] = useState<AbuseReport[]>([]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<string>('');

  useEffect(() => {
    void loadReports();
  }, [request]);

  const loadReports = async () => {
    const data = await request<AbuseReport[]>('GET', '/admin/abuse-reports');
    if (data) {
      setReports(data);
    }
  };

  const handleReview = async (report: AbuseReport) => {
    if (!newStatus) return;
    setReviewingId(report.id);
    try {
      const updated = await request<AbuseReport>(
        'PUT',
        `/admin/abuse-reports/${report.id}`,
        { status: newStatus, reviewedBy: '' }
      );
      if (updated) {
        setReports((prev) =>
          prev.map((r) => (r.id === report.id ? updated : r))
        );
        setNewStatus('');
        addToast({ message: t('admin.abuseReportReviewed'), type: 'success' });
      }
    } catch (err) {
      addToast({
        message: err instanceof Error ? err.message : t('common.error'),
        type: 'error',
      });
    } finally {
      setReviewingId(null);
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {t('admin.abuseReports')}
        </h1>
        <p className="text-gray-600 mb-8">
          {t('admin.abuseReportsDescription')}
        </p>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-primary mx-auto" />
          </div>
        ) : reports.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-gray-500">{t('admin.noAbuseReports')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-sm font-semibold text-gray-600">
                    {t('admin.reportId')}
                  </th>
                  <th className="px-4 py-3 text-sm font-semibold text-gray-600">
                    {t('admin.targetType')}
                  </th>
                  <th className="px-4 py-3 text-sm font-semibold text-gray-600">
                    {t('admin.targetId')}
                  </th>
                  <th className="px-4 py-3 text-sm font-semibold text-gray-600">
                    {t('admin.reason')}
                  </th>
                  <th className="px-4 py-3 text-sm font-semibold text-gray-600">
                    {t('admin.status')}
                  </th>
                  <th className="px-4 py-3 text-sm font-semibold text-gray-600">
                    {t('admin.createdAt')}
                  </th>
                  <th className="px-4 py-3 text-sm font-semibold text-gray-600">
                    {t('admin.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                      {report.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {report.targetType}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 truncate max-w-xs">
                      {report.targetId.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 truncate max-w-xs">
                      {report.reason}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_BADGE[report.status] || 'bg-gray-100 text-gray-800'}`}
                      >
                        {report.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(report.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {reviewingId === report.id ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={newStatus}
                            onChange={(e) => setNewStatus(e.target.value)}
                            className="px-2 py-1 text-sm border border-gray-300 rounded"
                            disabled={reviewingId !== report.id}
                          >
                            <option value="pending">{t('admin.statusPending')}</option>
                            <option value="reviewed">{t('admin.statusReviewed')}</option>
                            <option value="dismissed">{t('admin.statusDismissed')}</option>
                            <option value="actioned">{t('admin.statusActioned')}</option>
                          </select>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleReview(report)}
                            disabled={!newStatus}
                          >
                            {t('common.save')}
                          </Button>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => setReviewingId(report.id)}>
                          {t('admin.review')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
