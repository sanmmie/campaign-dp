import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Project, TemplateVersion } from '@deltadp/shared';

interface AuthState {
  user: {
    id: string;
    email: string;
    role?: string;
    memberships: Array<{ organizationId: string; role: string }>;
    isPlatformAdmin: boolean;
  } | null;
  isAdmin: boolean;
  isGuest: boolean;
  guestProject: Project | null;
  authReady: boolean;
  setAuth: (
    user: AuthState['user'],
    isAdmin: boolean
  ) => void;
  clearAuth: () => void;
  setAuthReady: (ready: boolean) => void;
  setGuestMode: () => void;
  setGuestProject: (project: Project) => void;
  clearGuestProject: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAdmin: false,
  isGuest: false,
  authReady: false,
  guestProject: null,

  setAuth: (user, isAdmin) =>
    set({
      user,
      isAdmin,
      isGuest: false,
      authReady: true,
    }),

  clearAuth: () =>
    set({
      user: null,
      isAdmin: false,
      isGuest: false,
      guestProject: null,
      authReady: true,
    }),

  setAuthReady: (authReady) => set({ authReady }),

  setGuestMode: () =>
    set({
      user: null,
      isAdmin: false,
      isGuest: true,
      authReady: true,
      guestProject: null,
    }),

  setGuestProject: (project) => set({ guestProject: project, isGuest: true }),

  clearGuestProject: () => set({ guestProject: null }),
}));

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
