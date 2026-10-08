import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Layout } from '../components/layout/Layout';

interface Pack {
  id: string;
  name: string;
  templates: Array<{
    id: string;
    name: string;
    versions: Array<{
      id: string;
      templateId: string;
      version: number;
      name: string;
      canvas: { width: number; height: number };
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
      }>;
    }>;
  }>;
}

interface CreatedProject {
  id: string;
}

export function Projects() {
  const [pack, setPack] = useState<Pack | null>(null);
  const { request, loading } = useApi();
  const { addToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadPack();
  }, []);

  const loadPack = async () => {
    const data = await request<Pack>('GET', '/packs');
    if (data) {
      setPack(data);
    }
  };

  const handleCreateProject = async (templateId: string, version: number) => {
    if (!pack) return;
    
    const template = pack.templates
      .find(t => t.id === templateId)
      ?.versions.find(v => v.version === version);

    if (!template) {
      addToast({ message: 'Template not found', type: 'error' });
      return;
    }

    const data = await request<CreatedProject>('POST', '/projects', {
      packId: pack.id,
      templateId,
      templateVersion: version,
      templateSnapshot: template,
      textValues: {},
      editorState: { zoom: 1, panX: 0, panY: 0, selectedLayerId: null, showGrid: false, snapToGrid: true },
      exportSettings: { presetId: 'instagram-square', format: 'png', quality: 90, includeDisclaimer: true },
    });

    if (data) {
      addToast({ message: 'Project created!', type: 'success' });
      navigate(`/editor/${data.id}`);
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Create New Project</h1>
        <p className="text-gray-600 mb-8">Choose a template to get started.</p>

        {loading || !pack ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-primary mx-auto"></div>
          </div>
        ) : (
          <div className="space-y-8">
            {pack.templates.map((template) => (
              <Card key={template.id}>
                <CardHeader>
                  <CardTitle>{template.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {template.versions.map((version) => (
                      <div
                        key={version.id}
                        className="border border-gray-200 rounded-lg overflow-hidden cursor-pointer hover:shadow-md transition"
                        onClick={() => handleCreateProject(template.id, version.version)}
                      >
                        <div
                          className="bg-gray-100 flex items-center justify-center"
                          style={{
                            aspectRatio: `${version.canvas.width}/${version.canvas.height}`,
                          }}
                        >
                          <span className="text-gray-400">v{version.version}</span>
                        </div>
                        <div className="p-3">
                          <p className="font-medium text-gray-900">{version.name}</p>
                          <p className="text-sm text-gray-500">
                            {version.canvas.width} × {version.canvas.height}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}