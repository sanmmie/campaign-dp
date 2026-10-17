import React, { useEffect, useState } from 'react';
import { Layout } from '../../components/layout/Layout';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../hooks/useToast';
import { useTranslation } from '../../i18n/I18nContext';

interface Font {
  id: string;
  name: string;
  family: string;
  weights: number[];
  url: string;
  unicodeRanges: string[];
  supportsYoruba: boolean;
  variable: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function Fonts() {
  const { t } = useTranslation();
  const { request, loading } = useApi();
  const { addToast } = useToast();
  const [fonts, setFonts] = useState<Font[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [family, setFamily] = useState('');
  const [url, setUrl] = useState('');
  const [weights, setWeights] = useState('400');
  const [supportsYoruba, setSupportsYoruba] = useState(false);
  const [variable, setVariable] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadFonts();
  }, [request]);

  const loadFonts = async () => {
    const data = await request<Font[]>('GET', '/admin/fonts');
    if (data) {
      setFonts(data);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await request<Font>('POST', '/admin/fonts', {
        name,
        family,
        weights: weights.split(',').map((w) => parseInt(w.trim(), 10)).filter((w) => !isNaN(w)),
        url,
        unicodeRanges: [],
        supportsYoruba,
        variable,
        isActive,
      });
      if (created) {
        setFonts((prev) => [created, ...prev]);
        setName('');
        setFamily('');
        setUrl('');
        setWeights('400');
        setSupportsYoruba(false);
        setVariable(false);
        setIsActive(true);
        addToast({ message: t('admin.fontCreated'), type: 'success' });
      }
    } catch (err) {
      addToast({
        message: err instanceof Error ? err.message : t('common.error'),
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (font: Font) => {
    try {
      const updated = await request<Font>('PUT', `/admin/fonts/${font.id}`, {
        name: font.name,
        family: font.family,
        url: font.url,
        isActive: !font.isActive,
      });
      if (updated) {
        setFonts((prev) =>
          prev.map((f) => (f.id === font.id ? updated : f))
        );
      }
    } catch (err) {
      addToast({
        message: err instanceof Error ? err.message : t('common.error'),
        type: 'error',
      });
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {t('admin.fonts')}
            </h1>
            <p className="text-gray-600">
              {t('admin.fontsDescription')}
            </p>
          </div>
          <Button variant="primary" onClick={() => setEditingId(null)}>
            {t('admin.addFont')}
          </Button>
        </div>

        {editingId === null && (
          <>
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-primary mx-auto" />
              </div>
            ) : fonts.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <p className="text-gray-500">{t('admin.noFonts')}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {fonts.map((font) => (
                  <Card key={font.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {font.name}
                        </h3>
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            font.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {font.isActive ? t('admin.active') : t('admin.inactive')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">
                        {font.family} · {font.weights.join(', ')}
                      </p>
                      <p className="text-xs text-gray-500 mb-4 truncate max-w-full">
                        {font.url}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingId(font.id);
                            setName(font.name);
                            setFamily(font.family);
                            setUrl(font.url);
                            setSupportsYoruba(font.supportsYoruba);
                            setVariable(font.variable);
                            setIsActive(font.isActive);
                          }}
                        >
                          {t('common.edit')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(font)}
                          className={`text-${font.isActive ? 'red' : 'green'}-600 hover:text-${font.isActive ? 'red' : 'green'}-700`}
                        >
                          {font.isActive ? t('admin.deactivate') : t('admin.activate')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {editingId !== null && (
          <Card className="max-w-lg">
            <CardHeader>
              <CardTitle>
                {editingId ? t('admin.editFont') : t('admin.addFont')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <Input
                  label={t('admin.fontName')}
                  value={name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                  required
                />
                <Input
                  label={t('admin.fontFamily')}
                  value={family}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFamily(e.target.value)}
                  required
                />
                <Input
                  label={t('admin.fontUrl')}
                  type="url"
                  value={url}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
                  required
                />
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    {t('admin.fontWeights')}
                  </label>
                  <Input
                    type="text"
                    value={weights}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWeights(e.target.value)}
                    placeholder="e.g. 400, 700"
                  />
                  <p className="text-xs text-gray-500">
                    {t('admin.fontWeightsHint')}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={supportsYoruba}
                    onChange={(e) => setSupportsYoruba(e.target.checked)}
                    className="rounded border-gray-300 text-brand-primary focus:ring-brand-primary"
                  />
                  {t('admin.supportsYoruba')}
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={variable}
                    onChange={(e) => setVariable(e.target.checked)}
                    className="rounded border-gray-300 text-brand-primary focus:ring-brand-primary"
                  />
                  {t('admin.variableFont')}
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded border-gray-300 text-brand-primary focus:ring-brand-primary"
                  />
                  {t('admin.isActive')}
                </label>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" variant="primary" loading={saving}>
                    {saving ? t('common.saving') : t('common.save')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
