import React, { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';

interface PackConfig {
  id: string;
  name: string;
  authorizedBy: string | null;
  authorizationRef: string | null;
  disclaimer: string;
}

export function Admin() {
  const { request, loading } = useApi();
  const { addToast } = useToast();
  const [pack, setPack] = useState<PackConfig | null>(null);
  const [authorizedBy, setAuthorizedBy] = useState('');
  const [authorizationRef, setAuthorizationRef] = useState('');
  const [disclaimer, setDisclaimer] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const data = await request<PackConfig>('GET', '/packs');
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
      const updated = await request<PackConfig>(
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
        addToast({ message: 'Campaign authorization updated', type: 'success' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
        <p className="text-gray-600 mb-8">Manage campaign packs, templates, and users.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent>
              <p className="text-sm text-gray-500">Campaign Packs</p>
              <p className="text-3xl font-bold text-gray-900">1</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-sm text-gray-500">Templates</p>
              <p className="text-3xl font-bold text-gray-900">—</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-sm text-gray-500">Total Generations</p>
              <p className="text-3xl font-bold text-gray-900">—</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Campaign Authorization</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">
              Update the authorized-by attribution and disclaimer for the campaign pack.
            </p>
            {loading || !pack ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-primary mx-auto"></div>
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-4">
                <Input
                  label="Authorized By"
                  placeholder="Name of authorizing body"
                  value={authorizedBy}
                  onChange={(e) => setAuthorizedBy(e.target.value)}
                />
                <Input
                  label="Authorization Reference"
                  placeholder="Reference number or URL"
                  value={authorizationRef}
                  onChange={(e) => setAuthorizationRef(e.target.value)}
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Disclaimer
                  </label>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent outline-none"
                    rows={3}
                    placeholder="Disclaimer text"
                    value={disclaimer}
                    onChange={(e) => setDisclaimer(e.target.value)}
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" variant="primary" loading={saving}>
                    Save Changes
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
