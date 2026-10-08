import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Layout } from '../components/layout/Layout';

interface Project {
  id: string;
  packId: string;
  templateId: string;
  templateVersion: number;
  templateSnapshot: {
    canvas: { width: number; height: number };
    photoZone: { x: number; y: number; width: number; height: number; shape: string };
    layers: Array<{
      id: string;
      type: string;
      x: number;
      y: number;
      width?: number;
      height?: number;
      text?: string;
      fontSize?: number;
      color?: string;
      fontFamily?: string;
      opacity?: number;
    }>;
  };
  photoUrl: string | null;
  textValues: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export function Editor() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [textValues, setTextValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const { request, loading } = useApi();
  const { addToast } = useToast();

  useEffect(() => {
    if (projectId) {
      loadProject(projectId);
    }
  }, [projectId]);

  const loadProject = async (id: string) => {
    const data = await request<Project>('GET', `/projects/${id}`);
    if (data) {
      setProject(data);
      setTextValues(data.textValues);
    }
  };

  const handleTextChange = (layerId: string, value: string) => {
    setTextValues((prev) => ({ ...prev, [layerId]: value }));
  };

  const handlePreview = async () => {
    if (!project) return;
    const data = await request<{ dataUrl: string; width: number; height: number }>('POST', '/preview', {
      templateId: project.templateId,
      templateVersion: project.templateVersion,
      photoUrl: project.photoUrl,
      textValues,
      includeDisclaimer: true,
    });
    if (data) {
      setPreview(data.dataUrl);
    }
  };

  const handleExport = async () => {
    if (!project) return;
    const data = await request<{ generationId: string; url: string }>('POST', '/generate', {
      projectId: project.id,
      templateId: project.templateId,
      templateVersion: project.templateVersion,
      photoUrl: project.photoUrl,
      textValues,
      presetId: 'instagram-square',
      format: 'png',
      quality: 90,
      includeDisclaimer: true,
    });
    if (data) {
      addToast({ message: 'Image generated successfully!', type: 'success' });
    }
  };

  if (loading || !project) {
    return (
      <Layout>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-primary mx-auto"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <Link to="/projects" className="text-brand-primary hover:underline text-sm">
              ← Back
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">Editor</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handlePreview}>
              Preview
            </Button>
            <Button variant="primary" onClick={handleExport}>
              Export
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Canvas Preview */}
          <div className="lg:col-span-2">
            <Card>
              <CardContent>
                <div
                  className="mx-auto bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center"
                  style={{
                    aspectRatio: `${project.templateSnapshot.canvas.width}/${project.templateSnapshot.canvas.height}`,
                    maxWidth: '100%',
                  }}
                >
                  {preview ? (
                    <img src={preview} alt="Preview" className="w-full h-full object-contain" />
                  ) : project.photoUrl ? (
                    <img src={project.photoUrl} alt="Photo" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-gray-400">Canvas</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Controls */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Text Layers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {project.templateSnapshot.layers
                  .filter((layer) => layer.type === 'text')
                  .map((layer) => (
                    <div key={layer.id}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {layer.text || layer.id}
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent outline-none"
                        value={textValues[layer.id] || layer.text || ''}
                        onChange={(e) => handleTextChange(layer.id, e.target.value)}
                      />
                    </div>
                  ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}