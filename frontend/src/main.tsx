import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { BrowserRouter } from 'react-router-dom';
import { AppRouter } from './router';
import { ToastProvider } from './components/ui/Toast';
import { I18nProvider } from './i18n/I18nContext';
import { useAuthBootstrap } from './hooks/useAuthBootstrap';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

export function App() {
  const { ready } = useAuthBootstrap();

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <ToastProvider>
            <BrowserRouter>
              <AppRouter />
            </BrowserRouter>
          </ToastProvider>
        </I18nProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;