import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';

interface Member {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
}

interface OrganizationDetail {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  ownerId: string | null;
  role: string | undefined;
  isPlatformAdmin: boolean;
  settings: string;
  brandPrimary: string | null;
  brandSecondary: string | null;
  brandAccent: string | null;
  brandLockup: { id: string; url: string; type: string } | null;
  defaultHeadline: string | null;
  defaultSubhead: string | null;
  state: string | null;
  lga: string | null;
  ward: string | null;
  members: Member[];
}

interface SettingsForm {
  state: string;
  lga: string;
  ward: string;
  customDomain: string;
  contactEmail: string;
  appName: string;
  supportEmail: string;
}

interface BrandingForm {
  brandPrimary: string;
  brandSecondary: string;
  brandAccent: string;
  defaultHeadline: string;
  defaultSubhead: string;
}

export function OrganizationSettingsPage() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const { request } = useApi();
  const { addToast } = useToast();
  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [memberLoading, setMemberLoading] = useState<Record<string, boolean>>({});

  const initialSettings: SettingsForm = {
    state: '',
    lga: '',
    ward: '',
    customDomain: '',
    contactEmail: '',
    appName: '',
    supportEmail: '',
  };

  const initialBranding: BrandingForm = {
    brandPrimary: '',
    brandSecondary: '',
    brandAccent: '',
    defaultHeadline: '',
    defaultSubhead: '',
  };

  const [settings, setSettings] = useState<SettingsForm>(initialSettings);
  const [branding, setBranding] = useState<BrandingForm>(initialBranding);

  useEffect(() => {
    void (async () => {
      const data = await request<OrganizationDetail>(
        'GET',
        `/api/organizations/${organizationId}`
      );
      if (data) {
        setOrg(data);
        const parsed: Record<string, unknown> = {};
        try {
          Object.assign(parsed, JSON.parse(data.settings ?? '{}'));
        } catch {
          // keep empty
        }
        setSettings({
          state: (data.state ?? '') as string,
          lga: (data.lga ?? '') as string,
          ward: (data.ward ?? '') as string,
          customDomain: (parsed.customDomain ?? '') as string,
          contactEmail: (parsed.contactEmail ?? '') as string,
          appName: (parsed.appName ?? '') as string,
          supportEmail: (parsed.supportEmail ?? '') as string,
        });
        setBranding({
          brandPrimary: (data.brandPrimary ?? '') as string,
          brandSecondary: (data.brandSecondary ?? '') as string,
          brandAccent: (data.brandAccent ?? '') as string,
          defaultHeadline: (data.defaultHeadline ?? '') as string,
          defaultSubhead: (data.defaultSubhead ?? '') as string,
        });
      }
    })();
  }, [request, organizationId]);

  const handleSettingsSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    setSettingsLoading(true);
    try {
      const body: Record<string, unknown> = {};
      if (settings.state) body.state = settings.state;
      if (settings.lga) body.lga = settings.lga;
      if (settings.ward) body.ward = settings.ward;
      if (settings.customDomain) body.customDomain = settings.customDomain;
      if (settings.contactEmail) body.contactEmail = settings.contactEmail;
      if (settings.appName) body.appName = settings.appName;
      if (settings.supportEmail) body.supportEmail = settings.supportEmail;

      const data = await request<any>('PATCH', `/api/organizations/${organizationId}/settings`, body);
      if (data) {
        addToast({ message: 'Organization settings updated.', type: 'success' });
        void (async () => {
          const refreshed = await request<OrganizationDetail>(
            'GET',
            `/api/organizations/${organizationId}`
          );
          if (refreshed) setOrg(refreshed);
        })();
      }
    } catch {
      addToast({ message: 'Failed to update organization settings.', type: 'error' });
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleBrandingSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    setBrandingLoading(true);
    try {
      const data = await request<any>('PATCH', `/api/organizations/${organizationId}/branding`, {
        brandPrimary: branding.brandPrimary || undefined,
        brandSecondary: branding.brandSecondary || undefined,
        brandAccent: branding.brandAccent || undefined,
        defaultHeadline: branding.defaultHeadline || undefined,
        defaultSubhead: branding.defaultSubhead || undefined,
      });
      if (data) {
        addToast({ message: 'Organization branding updated.', type: 'success' });
        void (async () => {
          const refreshed = await request<OrganizationDetail>(
            'GET',
            `/api/organizations/${organizationId}`
          );
          if (refreshed) setOrg(refreshed);
        })();
      }
    } catch {
      addToast({ message: 'Failed to update organization branding.', type: 'error' });
    } finally {
      setBrandingLoading(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!organizationId) return;
    if (!window.confirm(`Change organization status to ${status}?`)) return;
    setStatusLoading(true);
    try {
      const data = await request<any>('PATCH', `/api/organizations/${organizationId}/status`, {
        status,
      });
      if (data) {
        addToast({ message: `Organization status updated to ${status}.`, type: 'success' });
        setOrg((o) => (o ? { ...o, status: data.status } : o));
      }
    } catch {
      addToast({ message: 'Failed to update organization status.', type: 'error' });
    } finally {
      setStatusLoading(false);
    }
  };

  const handleMemberRole = async (userId: string, role: string) => {
    if (!organizationId) return;
    setMemberLoading((prev) => ({ ...prev, [userId]: true }));
    try {
      const data = await request<any>('PATCH', `/api/organizations/${organizationId}/members/${userId}`, {
        role,
      });
      if (data) {
        addToast({ message: 'Coordinator role updated.', type: 'success' });
        setOrg((o) =>
          o
            ? {
                ...o,
                members: o.members.map((m) =>
                  m.userId === userId ? { ...m, role: data.role } : m
                ),
              }
            : o
        );
      }
    } catch {
      addToast({ message: 'Failed to update coordinator role.', type: 'error' });
    } finally {
      setMemberLoading((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }
  };

  if (!org) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-primary"></div>
        </div>
      </Layout>
    );
  }

  const canManage = org.role === 'org_admin' || org.role === 'platform_admin' || org.isPlatformAdmin;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Organization settings</h1>
            <p className="text-gray-600">
              Manage branding, coordinator roles, and organizational structure for{' '}
              <span className="font-medium">{org.name}</span>.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: identity & status */}
          <Card className="lg:col-span-1">
            <div className="p-4">
              <h2 className="font-semibold text-gray-900 mb-3">Organization</h2>
              <p className="text-sm text-gray-500 mb-3">{org.name}</p>
              <p className="text-xs text-gray-400 mb-4">Slug: {org.slug}</p>
              <p className="text-sm text-gray-500 mb-2">Plan: <span className="font-medium capitalize">{org.plan}</span></p>
              <p className="text-sm text-gray-500 mb-4">
                Status:{' '}
                <span
                  className={`font-medium ${
                    org.status === 'active'
                      ? 'text-green-600'
                      : org.status === 'suspended'
                      ? 'text-amber-600'
                      : 'text-red-600'
                  }`}
                >
                  {org.status}
                </span>
              </p>
              {canManage && (
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStatusChange('suspended')}
                    disabled={statusLoading || org.status === 'suspended'}
                    className="w-full"
                  >
                    Suspend organization
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStatusChange('active')}
                    disabled={statusLoading || org.status === 'active'}
                    className="w-full"
                  >
                    Reactivate
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* Center: branding */}
          <Card className="lg:col-span-1">
            <div className="p-4">
              <h2 className="font-semibold text-gray-900 mb-3">Branding</h2>
              {canManage ? (
                <form onSubmit={handleBrandingSave} className="space-y-3">
                  <Input
                    label="Primary color"
                    placeholder="#2563eb"
                    value={branding.brandPrimary}
                    onChange={(e) => setBranding({ ...branding, brandPrimary: e.target.value })}
                  />
                  <Input
                    label="Secondary color"
                    placeholder="#7c3aed"
                    value={branding.brandSecondary}
                    onChange={(e) => setBranding({ ...branding, brandSecondary: e.target.value })}
                  />
                  <Input
                    label="Accent color"
                    placeholder="#dc2626"
                    value={branding.brandAccent}
                    onChange={(e) => setBranding({ ...branding, brandAccent: e.target.value })}
                  />
                  <Input
                    label="Default headline"
                    value={branding.defaultHeadline}
                    onChange={(e) => setBranding({ ...branding, defaultHeadline: e.target.value })}
                  />
                  <Input
                    label="Default subhead"
                    value={branding.defaultSubhead}
                    onChange={(e) => setBranding({ ...branding, defaultSubhead: e.target.value })}
                  />
                  <Button variant="primary" size="sm" loading={brandingLoading} disabled={!canManage}>
                    Save branding
                  </Button>
                </form>
              ) : (
                <div className="text-sm text-gray-500">View only — not an organization admin.</div>
              )}
              {org.brandLockup && (
                <div className="mt-4 p-2 rounded border border-gray-200">
                  <img
                    src={org.brandLockup.url}
                    alt="Brand lockup"
                    className="h-12 object-contain"
                  />
                </div>
              )}
            </div>
          </Card>

          {/* Right: Nigerian structure */}
          <Card className="lg:col-span-1">
            <div className="p-4">
              <h2 className="font-semibold text-gray-900 mb-3">Organizational structure</h2>
              <p className="text-xs text-gray-500 mb-3">State / LGA / Ward</p>
              {canManage ? (
                <form onSubmit={handleSettingsSave} className="space-y-3">
                  <Input
                    label="State"
                    value={settings.state}
                    onChange={(e) => setSettings({ ...settings, state: e.target.value })}
                  />
                  <Input
                    label="LGA"
                    value={settings.lga}
                    onChange={(e) => setSettings({ ...settings, lga: e.target.value })}
                  />
                  <Input
                    label="Ward"
                    value={settings.ward}
                    onChange={(e) => setSettings({ ...settings, ward: e.target.value })}
                  />
                  <Button variant="primary" size="sm" loading={settingsLoading} disabled={!canManage}>
                    Save structure
                  </Button>
                </form>
              ) : (
                <>
                  <p className="text-sm">{settings.state || '—'}</p>
                  <p className="text-sm">{settings.lga || '—'}</p>
                  <p className="text-sm">{settings.ward || '—'}</p>
                </>
              )}
            </div>
          </Card>
        </div>

        {/* White-label settings (full width) */}
        <Card className="mb-8">
          <div className="p-4">
            <h2 className="font-semibold text-gray-900 mb-3">White-label configuration</h2>
            <p className="text-sm text-gray-500 mb-4">
              Custom domain, contact email, and application identity shown to supporters.
            </p>
            {canManage ? (
              <form onSubmit={handleSettingsSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Custom domain"
                  placeholder="campaign.example.org"
                  value={settings.customDomain}
                  onChange={(e) => setSettings({ ...settings, customDomain: e.target.value })}
                />
                <Input
                  label="Contact email"
                  placeholder="hello@example.org"
                  type="email"
                  value={settings.contactEmail}
                  onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
                />
                <Input
                  label="Application name"
                  value={settings.appName}
                  onChange={(e) => setSettings({ ...settings, appName: e.target.value })}
                />
                <Input
                  label="Support email"
                  placeholder="support@example.org"
                  type="email"
                  value={settings.supportEmail}
                  onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                />
                <Button
                  variant="primary"
                  size="sm"
                  loading={settingsLoading}
                  disabled={!canManage}
                  className="md:col-span-2"
                >
                  Save white-label settings
                </Button>
              </form>
            ) : (
              <div className="text-sm text-gray-500 space-y-1">
                <p>Custom domain: {settings.customDomain || '—'}</p>
                <p>Contact email: {settings.contactEmail || '—'}</p>
                <p>Application name: {settings.appName || '—'}</p>
                <p>Support email: {settings.supportEmail || '—'}</p>
              </div>
            )}
          </div>
        </Card>

        {/* Coordinators / members */}
        <Card>
          <div className="p-4">
            <h2 className="font-semibold text-gray-900 mb-3">Coordinators &amp; team roles</h2>
            <p className="text-sm text-gray-500 mb-4">
              Manage organization members and their permissions.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="pb-3 font-medium">Member</th>
                    <th className="pb-3 font-medium">Role</th>
                    <th className="pb-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {org.members.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="pb-3 text-gray-900">
                        {m.userId}{' '}
                        <span className="text-xs text-gray-400">{m.createdAt.slice(0, 10)}</span>
                      </td>
                      <td className="pb-3">
                        {canManage ? (
                          <select
                            value={m.role}
                            onChange={(e) =>
                              handleMemberRole(m.userId, e.target.value)
                            }
                            disabled={memberLoading[m.userId]}
                            className="border border-gray-300 rounded px-2 py-1 bg-white text-sm focus:border-brand-primary"
                          >
                            <option value="org_admin">Organization admin</option>
                            <option value="campaign_manager">Campaign manager</option>
                            <option value="template_designer">Template designer</option>
                            <option value="analyst">Analyst (read-only)</option>
                          </select>
                        ) : (
                          <span className="text-gray-700 capitalize">{m.role}</span>
                        )}
                      </td>
                      <td className="pb-3 text-right">
                        {memberLoading[m.userId] ? (
                          <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-brand-primary"></span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {org.members.length === 0 && (
                    <tr>
                      <td colSpan={3} className="pb-6 text-center text-gray-500">
                        No coordinators yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
