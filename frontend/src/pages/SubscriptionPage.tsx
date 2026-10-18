import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { useTranslation } from '../i18n/I18nContext';
import { Link } from 'react-router-dom';

interface EntitlementsData {
  plan: string;
  entitlements: {
    plan: string;
    name: string;
    description: string;
    priceMonthlyNaira: number;
    priceYearlyNaira: number | null;
    generationLimitPerMonth: number;
    storageMb: number;
    teamSeats: number;
    campaignLimit: number;
    features: string[];
    isPaid: boolean;
    isEnterprise: boolean;
  };
  subscription: any;
  usage: {
    generationsThisMonth: number;
    generationLimit: number;
    generationRemaining: number;
    generationLimitUnlimited: boolean;
    memberCount: number;
    teamSeatLimit: number;
    campaignCount: number;
    campaignLimit: number;
  };
  canGenerate: boolean;
}

interface Receipt {
  id: string;
  reference: string;
  paystackReference: string | null;
  amountNaira: number;
  currency: string;
  status: string;
  plan: string;
  interval: string;
  paidAt: string | null;
  receiptNumber: string | null;
  customerEmail: string | null;
  createdAt: string;
}

export function SubscriptionPage() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const { request } = useApi();
  const { addToast } = useToast();
  const { t } = useTranslation();
  const [data, setData] = useState<EntitlementsData | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    void (async () => {
      const [ent, rec] = await Promise.all([
        request<EntitlementsData>(
          'GET',
          `/api/subscriptions/${organizationId}/entitlements`
        ),
        request<{ receipts: Receipt[] }>(
          'GET',
          `/api/subscriptions/${organizationId}/receipts`
        ),
      ]);
      setData(ent ?? null);
      setReceipts(rec?.receipts ?? []);
    })();
  }, [request, organizationId]);

  const handleCancel = async () => {
    if (!window.confirm(t('subscription.cancelConfirm'))) return;
    setCancelling(true);
    try {
      const res = await request<any>('POST', '/api/subscriptions/cancel', {
        organizationId: organizationId as string,
      });
      if (res) {
        addToast({ message: 'Subscription will cancel at period end.', type: 'success' });
        setData((d) => (d ? { ...d, subscription: { ...d.subscription, cancelAtPeriodEnd: true } } : d));
      }
    } catch {
      addToast({ message: t('common.error'), type: 'error' });
    } finally {
      setCancelling(false);
    }
  };

  if (!data) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-primary"></div>
        </div>
      </Layout>
    );
  }

  const { entitlements, usage, subscription, plan } = data;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('subscription.title')}</h1>
            <p className="text-gray-600">{t('subscription.subtitle')}</p>
          </div>
          <Link to="/pricing" className="hidden md:block inline-flex items-center justify-center font-medium rounded-lg transition focus:outline-none focus:ring-2 focus:ring-offset-2 border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-brand-primary px-4 py-2 text-base">
            {t('pricing.choosePlan')}
          </Link>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">{t('subscription.currentPlan')}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-500">{t('subscription.status')}</p>
              <p className="font-medium text-gray-900">
                {subscription?.status === 'active' ? t('subscription.active') : t('subscription.inactive')}
              </p>
              {subscription?.cancelAtPeriodEnd && (
                <p className="text-sm text-amber-600 mt-1">{t('subscription.cancelAtPeriodEnd')}</p>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('subscription.periodEnd')}</p>
              <p className="font-medium text-gray-900">
                {subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : '—'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('subscription.plan')}</p>
              <p className="font-medium text-gray-900 capitalize">{plan}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('pricing.generationsPerMonth')}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-6 py-4">
            <div>
              <p className="text-sm text-gray-500">{t('dashboard.generations')}</p>
              <p className="text-2xl font-bold text-gray-900">
                {usage.generationsThisMonth}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('pricing.teamSeats')}</p>
              <p className="text-2xl font-bold text-gray-900">
                {usage.teamSeatLimit === -1 ? '∞' : usage.memberCount}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('pricing.campaigns')}</p>
              <p className="text-2xl font-bold text-gray-900">
                {usage.campaignLimit === -1 ? '∞' : usage.campaignCount}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('pricing.storage')}</p>
              <p className="text-2xl font-bold text-gray-900">
                {entitlements.storageMb === -1 ? '∞' : `${entitlements.storageMb / 1024} GB`}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('subscription.receipts')}</CardTitle>
              </CardHeader>
              <CardContent>
                {receipts.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">{t('subscription.noReceipts')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500">
                          <th className="pb-3 font-medium">{t('subscription.reference')}</th>
                          <th className="pb-3 font-medium">{t('subscription.amount')}</th>
                          <th className="pb-3 font-medium">{t('subscription.statusLabel')}</th>
                          <th className="pb-3 font-medium">{t('subscription.paidAt')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {receipts.map((r) => (
                          <tr key={r.id} className="hover:bg-gray-50">
                            <td className="pb-3 text-gray-900 truncate max-w-xs">{r.reference}</td>
                            <td className="pb-3 text-gray-900">₦{(r.amountNaira / 100).toLocaleString()}</td>
                            <td className="pb-3 text-gray-900 capitalize">{r.status}</td>
                            <td className="pb-3 text-gray-500">
                              {r.paidAt ? new Date(r.paidAt).toLocaleDateString() : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {subscription?.status === 'active' ? (
                  <Button
                    variant="danger"
                    onClick={handleCancel}
                    disabled={cancelling}
                    loading={cancelling}
                    className="w-full"
                  >
                    {t('subscription.cancel')}
                  </Button>
                ) : (
                  <Link to="/pricing">
                    <Button variant="primary" className="w-full">
                      {t('pricing.choosePlan')}
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
