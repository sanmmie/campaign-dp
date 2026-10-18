import { RouteObject, useRoutes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ProtectedRoute, GuestRoute } from '../components/auth/ProtectedRoute';

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
const UpdatePassword = lazy(async () => {
  const mod = await import('../pages/auth/UpdatePassword');
  return { default: mod.UpdatePassword };
});
const CampaignAnalyticsPage = lazy(async () => {
  const mod = await import('../pages/CampaignAnalytics');
  return { default: mod.CampaignAnalytics };
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
const Templates = lazy(async () => {
  const mod = await import('../pages/Templates');
  return { default: mod.Templates };
});
const Admin = lazy(async () => {
  const mod = await import('../pages/Admin');
  return { default: mod.Admin };
});
const TemplateUpload = lazy(async () => {
  const mod = await import('../pages/TemplateUpload');
  return { default: mod.TemplateUpload };
});
const AbuseReports = lazy(async () => {
  const mod = await import('../pages/admin/AbuseReports');
  return { default: mod.AbuseReports };
});
const Fonts = lazy(async () => {
  const mod = await import('../pages/admin/Fonts');
  return { default: mod.Fonts };
});
const Analytics = lazy(async () => {
  const mod = await import('../pages/admin/Analytics');
  return { default: mod.Analytics };
});
const Profile = lazy(async () => {
  const mod = await import('../pages/Profile');
  return { default: mod.Profile };
});
const PublicCampaign = lazy(async () => {
  const mod = await import('../pages/PublicCampaign');
  return { default: mod.PublicCampaign };
});
const PricingPage = lazy(async () => {
  const mod = await import('../pages/PricingPage');
  return { default: mod.PricingPage };
});
const SubscriptionPage = lazy(async () => {
  const mod = await import('../pages/SubscriptionPage');
  return { default: mod.SubscriptionPage };
});
const SubscriptionCallbackPage = lazy(async () => {
  const mod = await import('../pages/SubscriptionCallbackPage');
  return { default: mod.SubscriptionCallbackPage };
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
    path: '/update-password',
    element: <UpdatePassword />,
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
    path: '/dashboard/:organizationId/analytics',
    element: (
      <ProtectedRoute>
        <CampaignAnalyticsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/dashboard/:organizationId/campaigns/:campaignId/analytics',
    element: (
      <ProtectedRoute>
        <CampaignAnalyticsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/editor/:projectId',
    element: (
      <GuestRoute>
        <Editor />
      </GuestRoute>
    ),
  },
  {
    path: '/projects',
    element: (
      <GuestRoute>
        <Projects />
      </GuestRoute>
    ),
  },
  {
    path: '/templates',
    element: <Templates />,
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
    path: '/admin/templates/upload',
    element: (
      <ProtectedRoute requireAdmin>
        <TemplateUpload />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/abuse-reports',
    element: (
      <ProtectedRoute requireAdmin>
        <AbuseReports />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/fonts',
    element: (
      <ProtectedRoute requireAdmin>
        <Fonts />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/analytics',
    element: (
      <ProtectedRoute requireAdmin>
        <Analytics />
      </ProtectedRoute>
    ),
  },
  {
    path: '/campaigns/:slug',
    element: <PublicCampaign />,
  },
  {
    path: '/pricing',
    element: <PricingPage />,
  },
  {
    path: '/dashboard/:organizationId/subscription',
    element: (
      <ProtectedRoute>
        <SubscriptionPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/subscription/callback',
    element: <SubscriptionCallbackPage />,
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
