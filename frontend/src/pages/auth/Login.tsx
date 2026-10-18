import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { useToast } from '../../hooks/useToast';
import { apiRequest } from '../../hooks/useApi';


export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuthStore();
  const { addToast } = useToast();

  if (user) {
    return <Navigate to="/dashboard" />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await apiRequest<{
        user: { id: string; email: string; role?: string; memberships: Array<{ organizationId: string; role: string }>; isPlatformAdmin: boolean };
        isAdmin: boolean;
        expiresAt: number | null;
      }>('/auth/login', {
        method: 'POST',
        body: { email: email.trim().toLowerCase(), password },
        retryOn401: false,
      });

      useAuthStore.getState().setAuth(data.user, Boolean(data.isAdmin));
      addToast({ message: 'Welcome back!', type: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      addToast({ message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Sign In</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <Input
              type="password"
              label="Password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" variant="primary" className="w-full" loading={loading}>
              Sign In
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-gray-600">
            Don&apos;t have an account?{' '}
            <Link to="/signup" className="text-brand-primary hover:underline">
              Sign up
            </Link>
          </p>
          <p className="mt-2 text-center text-sm text-gray-600">
            <Link to="/reset-password" className="text-brand-primary hover:underline">
              Forgot password?
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
