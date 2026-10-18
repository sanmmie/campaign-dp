import React, { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useApi } from '../hooks/useApi';
import { useAuthStore } from '../store';
import { useTranslation } from '../i18n/I18nContext';
import { useToast } from '../hooks/useToast';
import { Link } from 'react-router-dom';

interface Plan {
  plan: string;
  name: string;
  description: string;
  priceMonthlyNaira: number;
  priceYearlyNaira: number | null;
  priceMonthlyFormatted: string;
  priceYearlyFormatted: string | null;
  generationLimitPerMonth: number;
  storageMb: number;
  teamSeats: number;
  campaignLimit: number;
  features: string[];
  isPaid: boolean;
  isEnterprise: boolean;
  paystackPublicKey: string | undefined;
}

export function PricingPage() {
  const { request, loading } = useApi();
  const { addToast } = useToast();
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [paystackPublicKey, setPaystackPublicKey] = useState<string | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      const data = await request<{ plans: Plan[] }>('GET', '/api/subscriptions/plans');
      if (data) {
        setPlans(data.plans);
        if (data.plans.length > 0) setPaystackPublicKey(data.plans[0].paystackPublicKey);
      }
    })();
  }, [request]);

  const handleCheckout = async (plan: Plan, interval: 'monthly' | 'yearly') => {
    if (!user) {
      addToast({ message: 'Please sign in to subscribe.', type: 'error' });
      return;
    }
    if (!paystackPublicKey) {
      addToast({ message: t('pricing.paystackNotConfigured'), type: 'error' });
      return;
    }
    setCheckingOut(plan.plan);
    try {
      const membership = user.memberships[0];
      const organizationId = membership?.organizationId;
      if (!organizationId) {
        addToast({ message: 'No organization found to subscribe.', type: 'error' });
        return;
      }
      const data = await request<{
        authorizationUrl: string;
        reference: string;
        accessCode: string;
      }>('POST', '/api/subscriptions/checkout', {
        organizationId,
        plan: plan.plan as any,
        interval,
        email: user.email,
      });
      if (data?.authorizationUrl) {
        window.location.href = data.authorizationUrl;
      }
    } catch {
      addToast({ message: t('subscription.paymentFailed'), type: 'error' });
    } finally {
      setCheckingOut(null);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-primary"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-12 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('pricing.title')}</h1>
          <p className="text-gray-600">{t('pricing.subtitle')}</p>
        </div>

        {!paystackPublicKey && (
          <div className="mb-8 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            {t('pricing.paystackNotConfigured')}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <Card key={plan.plan} className="flex flex-col relative">
              {plan.isEnterprise && (
                <span className="absolute top-4 left-4 bg-gray-900 text-white text-xs font-medium px-2 py-1 rounded">
                  Enterprise
                </span>
              )}
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-gray-900">{plan.name}</h3>
                <p className="text-gray-500 text-sm mb-4">{plan.description}</p>
                <div className="flex items-baseline gap-2 mb-6">
                  <span className="text-3xl font-bold text-gray-900">
                    {plan.isPaid ? (plan.priceMonthlyFormatted) : t('pricing.free')}
                  </span>
                  {plan.isPaid && (
                    <span className="text-gray-500 text-sm">{t('pricing.perMonth')}</span>
                  )}
                </div>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-primary mt-1 shrink-0"></span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-t border-gray-200 p-4">
                {plan.isPaid ? (
                  <>
                    <Button
                      variant="primary"
                      onClick={() => handleCheckout(plan, 'monthly')}
                      disabled={checkingOut === plan.plan}
                      loading={checkingOut === plan.plan}
                      className="w-full mb-3"
                    >
                      {t('pricing.upgrade', { plan: plan.name })}
                    </Button>
                    {plan.priceYearlyNaira !== null && (
                      <Button
                        variant="outline"
                        onClick={() => handleCheckout(plan, 'yearly')}
                        disabled={checkingOut === plan.plan}
                        loading={checkingOut === plan.plan}
                        className="w-full"
                      >
                        {plan.priceYearlyFormatted ?? plan.priceMonthlyFormatted} {t('pricing.perYear')}
                      </Button>
                    )}
                  </>
                ) : (
                  <Button variant="outline" className="w-full" disabled>
                    {t('pricing.free')}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200 text-center">
          <p className="text-gray-600 text-sm mb-4">
            Already subscribed?{' '}
            <Link
              to={`/dashboard/${user?.memberships[0]?.organizationId ?? ''}/subscription`}
              className="text-brand-primary hover:underline"
            >
              Manage subscription
            </Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}
