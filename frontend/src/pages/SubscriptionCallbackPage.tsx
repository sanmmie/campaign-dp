import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { useTranslation } from '../i18n/I18nContext';

export function SubscriptionCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { request } = useApi();
  const { addToast } = useToast();
  const { t } = useTranslation();
  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'failed'>('idle');
  const [reference, setReference] = useState<string | null>(null);

  useEffect(() => {
    const ref = searchParams.get('reference') || searchParams.get('trxref');
    setReference(ref ?? null);
    if (ref) {
      void (async () => {
        setStatus('verifying');
        try {
          const data = await request<{ status: string }>('GET', `/api/subscriptions/verify/${ref}`);
          if (data?.status === 'success' || data?.status === 'already_processed') {
            setStatus('success');
            addToast({ message: t('subscription.paymentSuccess'), type: 'success' });
          } else {
            setStatus('failed');
            addToast({ message: t('subscription.paymentFailed'), type: 'error' });
          }
        } catch {
          setStatus('failed');
          addToast({ message: t('subscription.paymentFailed'), type: 'error' });
        }
      })();
    } else {
      setStatus('failed');
    }
  }, [searchParams, request, t, addToast]);

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          {status === 'verifying' && (
            <div className="space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-primary mx-auto"></div>
              <p className="text-gray-600">{t('subscription.verifying')}</p>
            </div>
          )}
          {status === 'success' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <h2 className="text-xl font-bold text-gray-900">Payment successful</h2>
              <p className="text-gray-600">
                Your subscription is now active. Reference: {reference ?? '—'}
              </p>
              <div className="mt-6">
                <Button variant="primary" className="w-full" onClick={() => navigate('/dashboard')}>
                  Go to Dashboard
                </Button>
              </div>
            </div>
          )}
          {status === 'failed' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              </div>
              <h2 className="text-xl font-bold text-gray-900">Payment failed</h2>
              <p className="text-gray-600">
                We could not verify your payment. Please try again.
              </p>
              <div className="mt-6">
                <Button variant="outline" onClick={() => navigate('/pricing')} className="w-full">
                  Try Again
                </Button>
              </div>
            </div>
          )}
          {status === 'idle' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900">Payment</h2>
              <p className="text-gray-600">No payment reference provided.</p>
              <div className="mt-6">
                <Button variant="outline" onClick={() => navigate('/pricing')} className="w-full">
                  Go to Pricing
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
