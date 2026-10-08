import React, { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';

interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  defaultName: string | null;
  defaultTitle: string | null;
  defaultOrganisation: string | null;
  defaultWardLGA: string | null;
}

export function Profile() {
  const { request, loading } = useApi();
  const { addToast } = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [defaultName, setDefaultName] = useState('');
  const [defaultTitle, setDefaultTitle] = useState('');
  const [defaultOrganisation, setDefaultOrganisation] = useState('');
  const [defaultWardLGA, setDefaultWardLGA] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const data = await request<UserProfile>('GET', '/profile');
      if (data) {
        setProfile(data);
        setDisplayName(data.displayName || '');
        setDefaultName(data.defaultName || '');
        setDefaultTitle(data.defaultTitle || '');
        setDefaultOrganisation(data.defaultOrganisation || '');
        setDefaultWardLGA(data.defaultWardLGA || '');
      }
    })();
  }, [request]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await request<UserProfile>('PUT', '/profile', {
        displayName: displayName.trim() || null,
        defaultName: defaultName.trim() || null,
        defaultTitle: defaultTitle.trim() || null,
        defaultOrganisation: defaultOrganisation.trim() || null,
        defaultWardLGA: defaultWardLGA.trim() || null,
      });
      if (updated) {
        setProfile(updated);
        addToast({ message: 'Profile updated', type: 'success' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Profile</h1>
        <p className="text-gray-600 mb-8">Manage your account settings.</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1">
            <CardContent className="text-center py-8">
              <div className="w-24 h-24 rounded-full bg-brand-primary/10 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl text-brand-primary">
                  {(profile?.displayName || profile?.email || 'U').charAt(0).toUpperCase()}
                </span>
              </div>
              <h2 className="text-xl font-semibold text-gray-900">
                {profile?.displayName || 'User'}
              </h2>
              <p className="text-gray-500 text-sm mb-4">
                {profile?.email || ''}
              </p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Default Details</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-primary mx-auto"></div>
                </div>
              ) : (
                <form onSubmit={handleSave} className="space-y-4">
                  <Input
                    label="Display Name"
                    placeholder="Your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                  <Input
                    label="Title"
                    placeholder="Your title"
                    value={defaultTitle}
                    onChange={(e) => setDefaultTitle(e.target.value)}
                  />
                  <Input
                    label="Organisation"
                    placeholder="Your organisation"
                    value={defaultOrganisation}
                    onChange={(e) => setDefaultOrganisation(e.target.value)}
                  />
                  <Input
                    label="Name"
                    placeholder="Your name"
                    value={defaultName}
                    onChange={(e) => setDefaultName(e.target.value)}
                  />
                  <Input
                    label="Ward / LGA"
                    placeholder="Your ward or LGA"
                    value={defaultWardLGA}
                    onChange={(e) => setDefaultWardLGA(e.target.value)}
                  />
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
      </div>
    </Layout>
  );
}
