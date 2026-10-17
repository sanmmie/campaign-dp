import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store';
import { useApi } from '../hooks/useApi';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Layout } from '../components/layout/Layout';

interface Project {
  id: string;
  packId: string;
  templateId: string;
  templateVersion: number;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export function Dashboard() {
  const { user } = useAuthStore();
  const { request, loading } = useApi();
  const [projects, setProjects] = useState<Project[]>([]);

  const loadProjects = useCallback(async () => {
    const data = await request<{ projects: Project[]; total: number }>('GET', '/projects?limit=6');
    if (data) {
      setProjects(data.projects);
    }
  }, [request]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}!
        </h1>
        <p className="text-gray-600 mt-1">Create and manage your campaign materials.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard title="Projects" value={projects.length} icon="📁" />
        <StatCard title="Generations" value="—" icon="⚡" />
        <StatCard title="Shares" value="—" icon="📤" />
      </div>

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Your Projects</h2>
        <Link to="/projects">
          <Button variant="primary">View All</Button>
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-primary mx-auto"></div>
        </div>
      ) : projects.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <div className="text-4xl mb-4">🎨</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No projects yet</h3>
            <p className="text-gray-600 mb-4">Start creating your first campaign material.</p>
            <Link to="/projects">
              <Button variant="primary">Create Project</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
    </Layout>
  );
}

function StatCard({ title, value, icon }: { title: string; value: number | string; icon: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div className="text-3xl">{icon}</div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link to={`/editor/${project.id}`}>
      <Card className="hover:shadow-lg transition cursor-pointer">
        <div className="aspect-video bg-gray-100 rounded-lg mb-3 flex items-center justify-center">
          {project.photoUrl ? (
            <img src={project.photoUrl} alt="Project" className="w-full h-full object-cover rounded-lg" />
          ) : (
            <span className="text-gray-400 text-2xl">🖼️</span>
          )}
        </div>
        <div className="flex justify-between items-start">
          <div>
            <p className="font-medium text-gray-900">Project {project.id.slice(0, 8)}</p>
            <p className="text-sm text-gray-500">
              Updated {new Date(project.updatedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </Card>
    </Link>
  );
}