import { RouteObject, useRoutes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';

const Landing = lazy(async () => {
  const mod = await import('../pages/Landing');
  return { default: mod.Landing };
});
const Login = lazy(async () => {
  const mod = await import('../pages/auth/Login');
  return { default: mod.Login };
});
const Signup = lazy(async () => {
  const mod = await import('../pages/auth/Signup');
  return { default: mod.Signup };
});
const ResetPassword = lazy(async () => {
  const mod = await import('../pages/auth/ResetPassword');
  return { default: mod.ResetPassword };
});
const Dashboard = lazy(async () => {
  const mod = await import('../pages/Dashboard');
  return { default: mod.Dashboard };
});
const Editor = lazy(async () => {
  const mod = await import('../pages/Editor');
  return { default: mod.Editor };
});
const Projects = lazy(async () => {
  const mod = await import('../pages/Projects');
  return { default: mod.Projects };
});
const Admin = lazy(async () => {
  const mod = await import('../pages/Admin');
  return { default: mod.Admin };
});
const Profile = lazy(async () => {
  const mod = await import('../pages/Profile');
  return { default: mod.Profile };
});
const NotFound = lazy(async () => {
  const mod = await import('../pages/NotFound');
  return { default: mod.NotFound };
});

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <Landing />,
  },
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/signup',
    element: <Signup />,
  },
  {
    path: '/reset-password',
    element: <ResetPassword />,
  },
  {
    path: '/dashboard',
    element: (
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: '/editor/:projectId',
    element: (
      <ProtectedRoute>
        <Editor />
      </ProtectedRoute>
    ),
  },
  {
    path: '/projects',
    element: (
      <ProtectedRoute>
        <Projects />
      </ProtectedRoute>
    ),
  },
  {
    path: '/profile',
    element: (
      <ProtectedRoute>
        <Profile />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin',
    element: (
      <ProtectedRoute requireAdmin>
        <Admin />
      </ProtectedRoute>
    ),
  },
  {
    path: '*',
    element: <NotFound />,
  },
];

export function AppRouter() {
  const routes = useRoutes(appRoutes);
  return <Suspense fallback={<LoadingFallback />}>{routes}</Suspense>;
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-primary"></div>
    </div>
  );
}
