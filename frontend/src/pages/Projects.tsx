import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { useAuthStore, useProjectStore } from '../store';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Layout } from '../components/layout/Layout';
import { Project } from '@deltadp/shared';

export function Projects() {
  const navigate = useNavigate();
  const { user, isGuest, guestProject, setGuestMode } = useAuthStore();
  const { request, loading } = useApi();
  const { addToast } = useToast();
  const { loadGuestProjects, saveGuestProjects, removeProject, setProjects } = useProjectStore();
  const [projects, setProjectsState] = useState<Project[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, [user, isGuest]);

  const loadProjects = async () => {
    if (user) {
      const data = await request<Project[]>('GET', '/projects');
      if (data) {
        setProjectsState(data);
        setProjects(data);
      }
    } else {
      const guestProjects = loadGuestProjects();
      if (guestProject) {
        const exists = guestProjects.find(p => p.id === guestProject.id);
        if (!exists) {
          const updated = [guestProject, ...guestProjects];
          saveGuestProjects(updated);
          setProjectsState(updated);
        } else {
          setProjectsState(guestProjects);
        }
      } else {
        setProjectsState(guestProjects);
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return;
    
    setDeletingId(id);
    try {
      if (user) {
        await request('DELETE', `/projects/${id}`);
        setProjectsState(prev => prev.filter(p => p.id !== id));
      } else {
        removeProject(id);
        const guestProjects = loadGuestProjects();
        saveGuestProjects(guestProjects.filter(p => p.id !== id));
        setProjectsState(prev => prev.filter(p => p.id !== id));
      }
      addToast({ message: 'Project deleted', type: 'success' });
    } catch (err) {
      addToast({ message: err instanceof Error ? err.message : 'Delete failed', type: 'error' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDuplicate = async (project: Project) => {
    const newProject = {
      ...project,
      id: user ? undefined : `guest-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      let created;
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, ...data } = newProject;
        created = await request<Project>('POST', '/projects', data);
      } else {
        created = { ...newProject, id: `guest-${Date.now()}` } as Project;
        const guestProjects = loadGuestProjects();
        saveGuestProjects([created, ...guestProjects]);
      }
      if (created) {
        addToast({ message: 'Project duplicated', type: 'success' });
        navigate(`/editor/${created.id}`);
      }
    } catch (err) {
      addToast({ message: err instanceof Error ? err.message : 'Duplicate failed', type: 'error' });
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Projects</h1>
            <p className="text-gray-600 mt-1">
              {user ? 'Your saved campaign projects' : 'Guest projects (saved locally in browser)'}
            </p>
          </div>
          {!user && !isGuest && (
            <Button variant="outline" onClick={() => setGuestMode()} className="w-full sm:w-auto">
              Continue as Guest
            </Button>
          )}
        </div>

        {/* Guest notice */}
        {!user && isGuest && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-3">
            <svg className="w-5 h-5 text-yellow-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-yellow-800 font-medium">Guest Mode</p>
              <p className="text-sm text-yellow-700">
                Your projects are stored locally in this browser. Sign in to save them permanently and access from any device.
              </p>
            </div>
            <Link to="/auth/signin" className="text-sm text-yellow-800 hover:underline font-medium">
              Sign In
            </Link>
          </div>
        )}

        {/* View mode toggle */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">View:</label>
            <div className="flex border border-gray-300 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-2 transition-colors ${viewMode === 'grid' ? 'bg-brand-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                aria-label="Grid view"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-2 transition-colors ${viewMode === 'list' ? 'bg-brand-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                aria-label="List view"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
          <div className="text-sm text-gray-500">
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Projects */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-primary mx-auto"></div>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16">
            <svg className="mx-auto h-16 w-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">No projects yet</h3>
            <p className="mt-2 text-gray-500 max-w-md mx-auto">
              Start by browsing templates and creating your first campaign design.
            </p>
            <Link to="/templates" className="mt-6 inline-block">
              <Button variant="primary" size="lg">
                Browse Templates
              </Button>
            </Link>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6' : 'space-y-4'}>
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onEdit={() => navigate(`/editor/${project.id}`)}
                onDuplicate={() => handleDuplicate(project)}
                onDelete={() => handleDelete(project.id)}
                isDeleting={deletingId === project.id}
                viewMode={viewMode}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

interface ProjectCardProps {
  project: Project;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  viewMode: 'grid' | 'list';
}

function ProjectCard({ project, onEdit, onDuplicate, onDelete, isDeleting, viewMode }: ProjectCardProps) {
  if (viewMode === 'list') {
    return (
      <Card className="flex flex-row items-center gap-4 p-4 hover:shadow-md transition-shadow">
        <div className="w-24 h-24 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden relative">
          {project.photoUrl ? (
            <img src={project.photoUrl} alt="Project preview" className="w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900 truncate">{project.templateSnapshot.name}</h3>
            <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">
              v{project.templateVersion}
            </span>
          </div>
          <p className="text-sm text-gray-500 truncate">
            Updated {new Date(project.updatedAt).toLocaleDateString()} · {project.templateSnapshot.canvas.width}×{project.templateSnapshot.canvas.height}px
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="secondary" size="sm" onClick={onEdit} disabled={isDeleting}>
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={onDuplicate} disabled={isDeleting}>
            Duplicate
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} disabled={isDeleting} className="text-red-600 hover:text-red-700 hover:bg-red-50">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col hover:shadow-lg transition-shadow group">
      <div className="aspect-square relative bg-gray-100 overflow-hidden">
        {project.photoUrl ? (
          <img src={project.photoUrl} alt="Project preview" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {isDeleting && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white" />
          </div>
        )}
      </div>
      <CardContent className="flex-1 flex flex-col p-4">
        <h3 className="font-semibold text-gray-900 mb-1 line-clamp-1">{project.templateSnapshot.name}</h3>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
          <span>v{project.templateVersion}</span>
          <span>·</span>
          <span>{project.templateSnapshot.canvas.width}×{project.templateSnapshot.canvas.height}</span>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Updated {new Date(project.updatedAt).toLocaleDateString()}
        </p>
        <div className="flex flex-wrap gap-1 mb-4">
          {project.templateSnapshot.layers.slice(0, 3).map((layer) => (
            <span key={layer.id} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
              {layer.type}
            </span>
          ))}
          {project.templateSnapshot.layers.length > 3 && (
            <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
              +{project.templateSnapshot.layers.length - 3} more
            </span>
          )}
        </div>
        <div className="flex gap-2 mt-auto">
          <Button variant="primary" className="flex-1" onClick={onEdit} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Edit'}
          </Button>
          <Button variant="outline" onClick={onDuplicate} disabled={isDeleting} className="flex-shrink-0">
            Duplicate
          </Button>
          <Button variant="ghost" onClick={onDelete} disabled={isDeleting} className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}