import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Project, TemplateVersion } from '@deltadp/shared';

interface AuthState {
  user: { id: string; email: string; role?: string } | null;
  isAdmin: boolean;
  token: string | null;
  isGuest: boolean;
  guestProject: Project | null;
  setAuth: (user: AuthState['user'], token: string | null, isAdmin: boolean) => void;
  clearAuth: () => void;
  setGuestMode: () => void;
  setGuestProject: (project: Project) => void;
  clearGuestProject: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAdmin: false,
      token: null,
      isGuest: false,
      guestProject: null,
      setAuth: (user, token, isAdmin) => set({ user, token, isAdmin, isGuest: false }),
      clearAuth: () => set({ user: null, token: null, isAdmin: false, isGuest: false, guestProject: null }),
      setGuestMode: () => set({ isGuest: true, user: null, token: null, isAdmin: false }),
      setGuestProject: (project) => set({ guestProject: project, isGuest: true }),
      clearGuestProject: () => set({ guestProject: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAdmin: state.isAdmin,
        token: state.token,
        isGuest: state.isGuest,
        guestProject: state.guestProject,
      }),
    }
  )
);

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  addToast: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: Math.random().toString(36).slice(2) }],
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  removeProject: (id: string) => void;
  setCurrentProject: (project: Project | null) => void;
  loadGuestProjects: () => Project[];
  saveGuestProjects: (projects: Project[]) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      projects: [],
      currentProject: null,
      setProjects: (projects) => set({ projects }),
      addProject: (project) => set((state) => ({ projects: [project, ...state.projects] })),
      updateProject: (id, updates) =>
        set((state) => ({
          projects: state.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        })),
      removeProject: (id) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
        })),
      setCurrentProject: (project) => set({ currentProject: project }),
      loadGuestProjects: () => {
        if (typeof window !== 'undefined') {
          const stored = localStorage.getItem('guest-projects');
          if (stored) {
            try {
              return JSON.parse(stored);
            } catch {
              return [];
            }
          }
        }
        return [];
      },
      saveGuestProjects: (projects) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('guest-projects', JSON.stringify(projects));
        }
      },
    }),
    {
      name: 'project-storage',
      partialize: (state) => ({ projects: state.projects, currentProject: state.currentProject }),
    }
  )
);

interface TemplateState {
  templates: TemplateVersion[];
  packs: any[];
  setTemplates: (templates: TemplateVersion[]) => void;
  setPacks: (packs: any[]) => void;
  getTemplatesByPack: (packId: string) => TemplateVersion[];
  getTemplatesByCategory: (category: string) => TemplateVersion[];
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  templates: [],
  packs: [],
  setTemplates: (templates) => set({ templates }),
  setPacks: (packs) => set({ packs }),
  getTemplatesByPack: (packId) => get().templates.filter((t) => t.templateId === packId),
  getTemplatesByCategory: (category) => get().templates.filter((t) => t.category === category),
}));