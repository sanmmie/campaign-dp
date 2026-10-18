import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store';
import { useApi } from '../hooks/useApi';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Layout } from '../components/layout/Layout';
import { useTranslation } from '../i18n/I18nContext';

interface MembershipOrg {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  role: string;
  isPlatformAdmin: boolean;
  campaignCount: number;
  packCount: number;
  generationCount: number;
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
  } | null;
}

interface CampaignSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  totalGenerations: number;
  packs: Array<{ id: string; name: string }>;
  createdAt: string;
}

interface OrgDashboardStats {
  organizationId: string;
  totalGenerations: number;
  generationsByFormat: Array<{ format: string; count: number }>;
  generationsByPreset: Array<{ presetId: string; count: number }>;
  recentGenerations: Array<{
    id: string;
    presetId: string;
    format: string;
    width: number;
    height: number;
    fileSize: number;
    createdAt: string;
  }>;
  templateUsage: number;
  totalTemplates: number;
  totalCampaigns: number;
}

interface Member {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
}

interface CampaignDetail {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: string;
  authorizedBy: string | null;
  authorizationRef: string | null;
  disclaimer: string;
  brandPrimary: string | null;
  brandSecondary: string | null;
  brandAccent: string | null;
  role: string;
  isPlatformAdmin: boolean;
  totalGenerations: number;
  packs: Array<{ id: string; name: string; createdAt: string }>;
  templates: Array<{
    id: string;
    name: string;
    category: string;
    latestVersion: number;
    versions: Array<{ id: string; version: number; name: string; isPublished: boolean }>;
  }>;
  recentGenerations: Array<{
    id: string;
    presetId: string;
    format: string;
    width: number;
    height: number;
    fileSize: number;
    createdAt: string;
  }>;
  members: Member[];
}

export function Dashboard() {
  const { user } = useAuthStore();
  const { request, loading } = useApi();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [orgs, setOrgs] = useState<MembershipOrg[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<OrgDashboardStats | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [campaignDetail, setCampaignDetail] = useState<CampaignDetail | null>(null);
  const [campaignLoading] = useState(false);

  useEffect(() => {
    loadOrgs();
  }, []);

  const loadOrgs = async () => {
    setOrgsLoading(true);
    try {
      const data = await request<MembershipOrg[]>('GET', '/organizations');
      if (data) {
        setOrgs(data);
        // Select first org if none selected
        if (!selectedOrgId && data.length > 0) {
          setSelectedOrgId(data[0].id);
        }
      }
    } catch {
      // handled by useApi error state
    } finally {
      setOrgsLoading(false);
    }
  };

  const loadCampaigns = async (orgId: string) => {
    setCampaignsLoading(true);
    try {
      const data = await request<CampaignSummary[]>(
        'GET',
        `/organizations/${encodeURIComponent(orgId)}/campaigns`
      );
      if (data) setCampaigns(data);
    } catch {
      // handled
    } finally {
      setCampaignsLoading(false);
    }
  };

  const loadDashboard = async (orgId: string) => {
    setDashboardLoading(true);
    try {
      const data = await request<OrgDashboardStats>(
        'GET',
        `/organizations/${encodeURIComponent(orgId)}/dashboard`
      );
      if (data) setDashboardStats(data);
    } catch {
      // handled
    } finally {
      setDashboardLoading(false);
    }
  };

  const loadMembers = async (orgId: string) => {
    setMembersLoading(true);
    try {
      const data = await request<Member[]>(
        'GET',
        `/organizations/${encodeURIComponent(orgId)}/members`
      );
      if (data) setMembers(data);
    } catch {
      // handled
    } finally {
      setMembersLoading(false);
    }
  };

  const handleOrgSelect = (orgId: string) => {
    setSelectedOrgId(orgId);
    setCampaignDetail(null);
    loadCampaigns(orgId);
    loadDashboard(orgId);
    loadMembers(orgId);
  };

  if (!user) return null;

  const currentOrg =
    orgs.find((o) => o.id === selectedOrgId) ??
    (orgs.length > 0 ? orgs[0] : null);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {t('dashboard.commandCentre')}
            </h1>
            <p className="text-gray-600 mt-1">
              {t('dashboard.commandCentreSubtitle')}
            </p>
          </div>
          <div className="flex gap-2">
            {currentOrg && currentOrg.role !== 'analyst' && (
              <Link to="/admin/templates/upload">
                <Button variant="outline" size="sm">
                  {t('dashboard.uploadTemplate')}
                </Button>
              </Link>
            )}
            <Link to="/templates">
              <Button variant="primary" size="sm">
                {t('dashboard.browseTemplates')}
              </Button>
            </Link>
          </div>
        </div>

        {/* Organization selector */}
        {orgs.length > 1 && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <span className="text-sm font-medium text-gray-700">
                  {t('dashboard.organization')}
                </span>
                <select
                  value={selectedOrgId || ''}
                  onChange={(e) => handleOrgSelect(e.target.value)}
                  className="flex-1 sm:w-80 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent outline-none"
                >
                  {orgs.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.role})
                    </option>
                  ))}
                </select>
                {currentOrg && (
                  <span className={`text-xs font-medium px-2 py-1 rounded ${
                    currentOrg.role === 'org_admin' || currentOrg.role === 'platform_admin'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {t('dashboard.role', { role: currentOrg.role })}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Campaign list / selector */}
        {!campaignDetail && currentOrg && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {t('dashboard.campaigns')}
            </h2>
            {campaignsLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-primary mx-auto"></div>
              </div>
            ) : campaigns.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <div className="text-4xl mb-4">📣</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {t('dashboard.noCampaigns')}
                  </h3>
                  <p className="text-gray-600 mb-4">
                    {t('dashboard.noCampaignsDesc')}
                  </p>
                  {currentOrg.role === 'org_admin' || currentOrg.role === 'platform_admin' || currentOrg.role === 'campaign_manager' && (
                    <Link to={`/organizations/${currentOrg.id}/campaigns/new`}>
                      <Button variant="primary">
                        {t('dashboard.createCampaign')}
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {campaigns.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/dashboard/${currentOrg!.id}/${c.id}`)}
                    className="cursor-pointer hover:shadow-md transition-shadow group rounded-xl bg-white border border-gray-200"
                  >
                    <Card className="p-4">
                      <CardContent className="p-0">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-gray-900">{c.name}</h3>
                          <span className={`text-xs font-medium px-2 py-1 rounded ${
                            c.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : c.status === 'draft'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {c.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mb-3">
                          {t('dashboard.generations', { count: c.totalGenerations })}
                        </p>
                        <div className="flex items-center justify-between text-xs text-gray-400">
                          <span>{c.packs.length} {t('dashboard.packs')}</span>
                          <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Campaign detail / command centre view */}
        {campaignDetail && (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{campaignDetail.name}</h2>
                <p className="text-gray-600 text-sm">
                  {campaignDetail.authorizedBy ? `${t('dashboard.authorizedBy')}: ${campaignDetail.authorizedBy}` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <Link to={`/dashboard/${campaignDetail.organizationId}`}>
                  <Button variant="ghost" size="sm">{t('dashboard.backToOrg')}</Button>
                </Link>
                {campaignDetail.role === 'org_admin' || campaignDetail.role === 'platform_admin' || campaignDetail.role === 'campaign_manager' && (
                  <Button variant="outline" size="sm">
                    {t('dashboard.editCampaign')}
                  </Button>
                )}
                <Link to={`/dashboard/${campaignDetail.organizationId}/campaigns/${campaignDetail.id}/analytics`}>
                  <Button variant="outline" size="sm">
                    {t('analytics.title')}
                  </Button>
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">{t('dashboard.totalGenerations')}</p>
                  <p className="text-3xl font-bold text-gray-900">{campaignDetail.totalGenerations}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">{t('dashboard.templates')}</p>
                  <p className="text-3xl font-bold text-gray-900">{campaignDetail.templates.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">{t('dashboard.packs')}</p>
                  <p className="text-3xl font-bold text-gray-900">{campaignDetail.packs.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">{t('dashboard.teamMembers')}</p>
                  <p className="text-3xl font-bold text-gray-900">{campaignDetail.members.length}</p>
                </CardContent>
              </Card>
            </div>

            {/* Templates */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>{t('dashboard.campaignTemplates')}</CardTitle>
              </CardHeader>
              <CardContent>
                {campaignDetail.templates.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">{t('dashboard.noTemplates')}</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {campaignDetail.templates.map((tmpl) => (
                      <Card key={tmpl.id} className="border-gray-200">
                        <CardContent className="p-4">
                          <h3 className="font-semibold text-gray-900 mb-1">{tmpl.name}</h3>
                          <p className="text-xs text-gray-500 mb-2">
                            {tmpl.category} · v{tmpl.latestVersion}
                          </p>
                          <div className="flex gap-2 mb-3">
                            {tmpl.versions.map((v) => (
                              <span key={v.id} className={`px-2 py-0.5 text-xs rounded ${
                                v.isPublished ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                                {v.isPublished ? t('dashboard.published') : t('dashboard.draft')}
                              </span>
                            ))}
                          </div>
                          <Link to={`/templates`}>
                            <Button variant="outline" size="sm" className="w-full">
                              {t('dashboard.useTemplate')}
                            </Button>
                          </Link>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent generations */}
            <Card>
              <CardHeader>
                <CardTitle>{t('dashboard.recentGenerations')}</CardTitle>
              </CardHeader>
              <CardContent>
                {campaignDetail.recentGenerations.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">{t('dashboard.noGenerations')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="px-4 py-3 text-xs font-semibold text-gray-600">{t('dashboard.preset')}</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-600">{t('dashboard.format')}</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-right">{t('dashboard.dimensions')}</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-600">{t('dashboard.created')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaignDetail.recentGenerations.map((g) => (
                          <tr key={g.id} className="border-b border-gray-100">
                            <td className="px-4 py-3 text-sm text-gray-900">{g.presetId}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{g.format.toUpperCase()}</td>
                            <td className="px-4 py-3 text-sm text-gray-600 text-right">{g.width}×{g.height}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{new Date(g.createdAt).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Org dashboard stats (when no campaign selected) */}
        {!campaignDetail && currentOrg && dashboardStats && !dashboardLoading && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {t('dashboard.organizationOverview', { name: currentOrg.name })}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">{t('dashboard.totalGenerations')}</p>
                  <p className="text-3xl font-bold text-gray-900">{dashboardStats.totalGenerations}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">{t('dashboard.templates')}</p>
                  <p className="text-3xl font-bold text-gray-900">{dashboardStats.totalTemplates}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">{t('dashboard.campaigns')}</p>
                  <p className="text-3xl font-bold text-gray-900">{dashboardStats.totalCampaigns}</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('dashboard.generationsByFormat')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {dashboardStats.generationsByFormat.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">{t('dashboard.noData')}</p>
                  ) : (
                    <div className="space-y-3">
                      {dashboardStats.generationsByFormat.map((item) => (
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
                  <CardTitle>{t('dashboard.generationsByPreset')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {dashboardStats.generationsByPreset.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">{t('dashboard.noData')}</p>
                  ) : (
                    <div className="space-y-3">
                      {dashboardStats.generationsByPreset.map((item) => (
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

            {/* Members */}
            <Card className="mt-8">
              <CardHeader>
                <CardTitle>{t('dashboard.teamMembers')}</CardTitle>
              </CardHeader>
              <CardContent>
                {membersLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-primary mx-auto"></div>
                  </div>
                ) : members.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">{t('dashboard.noMembers')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="px-4 py-3 text-xs font-semibold text-gray-600">{t('dashboard.userId')}</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-600">{t('dashboard.role')}</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-600">{t('dashboard.joined')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((m) => (
                          <tr key={m.id} className="border-b border-gray-100">
                            <td className="px-4 py-3 text-sm text-gray-900">{m.userId.slice(0, 8)}…</td>
                            <td className="px-4 py-3 text-sm">
                              <span className={`px-2 py-0.5 text-xs rounded ${
                                m.role === 'org_admin' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {m.role}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">{new Date(m.createdAt).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {loading || orgsLoading || campaignsLoading || dashboardLoading || membersLoading || campaignLoading && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg flex items-center gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
              <span>{t('common.loading')}</span>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
