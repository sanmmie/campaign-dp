import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { BrowserRouter } from 'react-router-dom';
import { AppRouter } from './router';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { I18nProvider } from './i18n/I18nContext';
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
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <AuthProvider>
            <ToastProvider>
              <BrowserRouter>
                <AppRouter />
              </BrowserRouter>
            </ToastProvider>
          </AuthProvider>
        </I18nProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;