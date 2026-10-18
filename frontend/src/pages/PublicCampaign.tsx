import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { useApi } from '../hooks/useApi';
import { useTranslation } from '../i18n/I18nContext';
import { QrCode } from '../components/qr/QrCode';
import { useToast } from '../hooks/useToast';

interface PublicCampaign {
  id: string;
  name: string;
  slug: string;
  status: string;
  authorizedBy: string | null;
  authorizationRef: string | null;
  disclaimer: string;
  brandPrimary: string | null;
  brandSecondary: string | null;
  brandAccent: string | null;
  createdAt: string;
  updatedAt: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
  } | null;
  packs: Array<{
    id: string;
    name: string;
    disclaimer: string;
    brandPrimary: string | null;
    brandSecondary: string | null;
    brandAccent: string | null;
    defaultHeadline: string;
    defaultSubhead: string;
    shareTargets: string[];
    assets: Array<{
      id: string;
      type: string;
      url: string;
      width: number | null;
      height: number | null;
      mimeType: string;
      uploadedAt: string;
    }>;
    lockup: {
      id: string;
      type: string;
      url: string;
      width: number | null;
      height: number | null;
      mimeType: string;
      uploadedAt: string;
    } | null;
    templates: Array<{
      id: string;
      name: string;
      category: string;
      latestVersion: number;
      versions: Array<{
        id: string;
        version: number;
        name: string;
        category: string;
        canvasWidth: number;
        canvasHeight: number;
        isPublished: boolean;
      }>;
    }>;
  }>;
  templates: Array<{
    id: string;
    name: string;
    category: string;
    latestVersion: number;
    versions: Array<{
      id: string;
      version: number;
      name: string;
      category: string;
      canvasWidth: number;
      canvasHeight: number;
      isPublished: boolean;
    }>;
  }>;
}

export function PublicCampaign() {
  const { t } = useTranslation();
  const { request, loading } = useApi();
  const { addToast } = useToast();
  const { slug } = useParams<{ slug: string }>();

  const [campaign, setCampaign] = useState<PublicCampaign | null>(null);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!slug) return;
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    setShareUrl(`${base}/campaigns/${slug}`);
    void loadCampaign();
  }, [slug, request]);

  const loadCampaign = async () => {
    if (!slug) return;
    try {
      const data = await request<PublicCampaign>(
        'GET',
        `/api/public/campaigns/${encodeURIComponent(slug ?? '')}`
      );
      if (data) {
        setCampaign(data);
        // Record referral attribution if ref param is present
        const ref = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ref') : null;
        if (ref) {
          await request('POST', '/api/analytics', {
            event: 'campaign_visit',
            properties: { campaignSlug: slug, ref },
            sessionId: ref,
          });
        } else {
          await request('POST', '/api/analytics', {
            event: 'campaign_visit',
            properties: { campaignSlug: slug },
            sessionId: slug,
          });
        }
      }
    } catch (err) {
      setCampaignError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Clipboard unavailable
    }
  };

  const handleShare = (platform: string) => {
    if (!shareUrl || !campaign) return;
    const text = `I support ${campaign.name}! ${campaign.disclaimer || ''} ${shareUrl}`;
    switch (platform) {
      case 'whatsapp':
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        break;
      case 'facebook':
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(text)}`, '_blank');
        break;
      case 'x':
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`, '_blank');
        break;
      case 'telegram':
        window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`, '_blank');
        break;
      default:
        break;
    }
    void request('POST', '/api/analytics', {
      event: 'share',
      properties: { platform, campaignSlug: slug },
      sessionId: slug,
    });
  };

  const handleUseTemplate = (packId: string, templateId: string) => {
    void request('POST', '/api/analytics', {
      event: 'template_use',
      properties: { packId, templateId, campaignSlug: slug },
      sessionId: slug,
    });
    addToast({
      message: t('share.templateSelected'),
      type: 'info',
    });
  };

  if (!slug) return null;

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('common.loading')}</p>
        </div>
      </Layout>
    );
  }

  if (campaignError || !campaign) {
    return (
      <Layout>
        <div className="text-center py-12">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900">{t('campaign.notFound')}</h2>
          <p className="text-gray-600">{campaignError || t('campaign.campaignNotFound')}</p>
          <Link to="/" className="text-brand-primary hover:underline">
            {t('common.backHome')}
          </Link>
        </div>
      </Layout>
    );
  }

  const brandStyles = {
    primary: campaign.brandPrimary || '#2563eb',
    secondary: campaign.brandSecondary || '#64748b',
    accent: campaign.brandAccent || '#f59e0b',
  };

  const allTemplates = campaign.templates.flatMap((t) =>
    t.versions.filter((v) => v.isPublished).map((v) => ({ ...t, packId: '', version: v }))
  );
  const packTemplates = campaign.packs.flatMap((p) =>
    p.templates.flatMap((t) =>
      t.versions.filter((v) => v.isPublished).map((v) => ({ ...t, packId: p.id, version: v }))
    )
  );

  return (
    <Layout>
      <Helmet>
        <title>{campaign.name} - Campaign-DP</title>
        <meta name="description" content={campaign.disclaimer || `Campaign materials for ${campaign.name}`} />
        <meta property="og:title" content={campaign.name} />
        <meta property="og:description" content={campaign.disclaimer || `Create and share campaign materials for ${campaign.name}`} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={shareUrl} />
        <meta property="og:site_name" content="Campaign-DP" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={campaign.name} />
        <meta name="twitter:description" content={campaign.disclaimer || `Create and share campaign materials for ${campaign.name}`} />
        {campaign.organization && (
          <>
            <meta property="og:determiner" content="" />
            <meta name="twitter:creator" content="" />
          </>
        )}
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Campaign header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-xs font-medium text-gray-600 mb-3">
            {campaign.organization ? (
              <>
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span>{campaign.organization.name}</span>
              </>
            ) : null}
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2" style={{ color: brandStyles.primary }}>
            {campaign.name}
          </h1>
          {campaign.authorizedBy && (
            <p className="text-sm text-gray-500 mb-4">
              {t('campaign.authorizedBy', { name: campaign.authorizedBy })}
            </p>
          )}
          {campaign.disclaimer && (
            <p className="text-sm text-gray-600 mb-6">{campaign.disclaimer}</p>
          )}
        </div>

        {/* Share + QR section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>{t('campaign.shareCampaign')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                {t('campaign.shareDescription')}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleShare('whatsapp')}
                  className="flex-1"
                >
                  💬 WhatsApp
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleShare('facebook')}
                  className="flex-1"
                >
                  📘 Facebook
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleShare('x')}
                  className="flex-1"
                >
                  ✖️ X
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleShare('telegram')}
                  className="flex-1"
                >
                  ✈️ Telegram
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 truncate flex-1">{shareUrl}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                >
                  {copied ? t('share.copied') : t('share.copyLink')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('campaign.qrCode')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center p-6">
              <QrCode value={shareUrl} size={160} margin={2} className="mb-4" />
              <p className="text-sm text-gray-600 text-center">
                {t('campaign.qrCodeDescription')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Templates */}
        {(allTemplates.length > 0 || packTemplates.length > 0) && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {t('campaign.availableTemplates')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...allTemplates, ...packTemplates].map((tpl) => {
                const v = tpl.version;
                return (
                  <Card key={`${tpl.id}-v${v.version}`} className="cursor-pointer hover:shadow-md transition-shadow group">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-gray-900">{tpl.name}</h3>
                        <span
                          className="text-[10px] font-medium px-2 py-0.5 rounded bg-green-100 text-green-700"
                        >
                          {t('campaign.published')}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">
                        {v.category} · {v.canvasWidth}×{v.canvasHeight}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUseTemplate(tpl.packId || '', tpl.id)}
                          className="flex-1"
                        >
                          {t('campaign.useTemplate')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Organization info */}
        {campaign.organization && (
          <Card className="mt-8">
            <CardContent className="p-6">
              <h3 className="font-semibold text-gray-900 mb-2">
                {t('campaign.organizationInfo', { name: campaign.organization.name })}
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                {t('campaign.plan', { plan: campaign.organization.plan })}
              </p>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                {t('campaign.statusActive')}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
