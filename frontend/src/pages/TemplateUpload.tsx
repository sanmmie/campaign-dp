import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { useAuthStore } from '../store';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Layout } from '../components/layout/Layout';
import { TemplateCategory } from '@deltadp/shared';

interface TemplateUploadData {
  packId: string;
  name: string;
  category: TemplateCategory;
  canvas: { width: number; height: number };
  photoZone: {
    x: number;
    y: number;
    width: number;
    height: number;
    shape: string;
    borderRadius: number | null;
    locked: boolean;
  };
  layers: any[];
  version: number;
}

export function TemplateUpload() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuthStore();
  const { request } = useApi();
  const { addToast } = useToast();

  if (!user || !isAdmin) {
    navigate('/dashboard');
    return null;
  }

  const [packId, setPackId] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('custom');
  const [canvasWidth, setCanvasWidth] = useState(1080);
  const [canvasHeight, setCanvasHeight] = useState(1080);
  const [layersJson, setLayersJson] = useState('[]');
  const [version, setVersion] = useState(1);
  const [uploading, setUploading] = useState(false);

  const categories: TemplateCategory[] = [
    'political', 'campaign', 'community', 'youth', 'business',
    'event', 'celebration', 'awareness', 'culture', 'custom',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);

    try {
      const layers = JSON.parse(layersJson);
      const data: TemplateUploadData = {
        packId,
        name,
        category,
        canvas: { width: canvasWidth, height: canvasHeight },
        photoZone: {
          x: 0,
          y: 0,
          width: canvasWidth,
          height: canvasHeight,
          shape: 'square',
          borderRadius: null,
          locked: false,
        },
        layers,
        version,
      };

      const result = await request<{
        templateId: string;
        templateVersion: { id: string; version: number; name: string; category: string; isPublished: boolean };
      }>('POST', '/api/admin/templates/upload', data);

      if (result) {
        addToast({ message: `Template "${name}" uploaded successfully`, type: 'success' });
        navigate(`/templates`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      addToast({ message, type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Upload Template Design</h1>
          <p className="text-gray-600 mt-2">
            Upload a template design JSON file for any use case. Templates are
            published immediately and available to all users.
          </p>
        </div>

        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Template Design Upload</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Campaign Pack ID
                </label>
                <Input
                  value={packId}
                  onChange={(e) => setPackId(e.target.value)}
                  placeholder="Enter pack ID"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Template Name
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Campaign Poster v1"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TemplateCategory)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent outline-none"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Canvas Width (px)
                  </label>
                  <Input
                    type="number"
                    value={canvasWidth}
                    onChange={(e) => setCanvasWidth(parseInt(e.target.value) || 1080)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Canvas Height (px)
                  </label>
                  <Input
                    type="number"
                    value={canvasHeight}
                    onChange={(e) => setCanvasHeight(parseInt(e.target.value) || 1080)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Version
                </label>
                <Input
                  type="number"
                  value={version}
                  onChange={(e) => setVersion(parseInt(e.target.value) || 1)}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Template Layers (JSON)
                </label>
                <textarea
                  value={layersJson}
                  onChange={(e) => setLayersJson(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent outline-none font-mono text-sm"
                  rows={8}
                  placeholder='[{"type":"text","id":"layer1","x":100,"y":100,"text":"Hello","fontSize":24,"fontFamily":"Arial","fontWeight":400,"color":"#000000","alignment":"center","lineHeight":1.2,"letterSpacing":0,"textTransform":"none","locked":false,"visible":true,"zIndex":1}]'
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Valid JSON array of layer objects. Each layer must have: type, id, x, y, and type-specific fields.
                </p>
              </div>

              <Button type="submit" variant="primary" className="w-full" loading={uploading}>
                Upload Template
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">Example Layer JSON</h3>
          <pre className="text-xs font-mono text-blue-700 overflow-x-auto">{`[
  {
    "type": "text",
    "id": "headline",
    "x": 50,
    "y": 50,
    "text": "Vote for Change",
    "fontSize": 48,
    "fontFamily": "Arial",
    "fontWeight": 700,
    "color": "#1a1a1a",
    "alignment": "center",
    "lineHeight": 1.2,
    "letterSpacing": 0,
    "textTransform": "uppercase",
    "locked": false,
    "visible": true,
    "zIndex": 1
  }
]`}</pre>
        </div>
      </div>
    </Layout>
  );
}
