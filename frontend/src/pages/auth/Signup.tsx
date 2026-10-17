import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { useToast } from '../../hooks/useToast';
import { apiRequest } from '../../hooks/useApi';
import { env } from '../../config/env';

export function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState('');
  const { user } = useAuthStore();
  const { addToast } = useToast();

  if (user) {
    return <Navigate to="/dashboard" />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const data = await apiRequest<{
        user: { id: string; email: string; role?: string };
        isAdmin: boolean;
        needsConfirmation?: boolean;
      }>('/auth/signup', {
        method: 'POST',
        body: { email: email.trim().toLowerCase(), password },
        retryOn401: false,
      });

      if (data.needsConfirmation) {
        setNeedsConfirmation(true);
        addToast({
          message: 'Check your email to confirm your account.',
          type: 'info',
        });
        return;
      }

      useAuthStore.getState().setAuth(data.user, Boolean(data.isAdmin));
      addToast({ message: 'Account created!', type: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Signup failed';
      setError(message);
      addToast({ message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (resending || resendCooldown > 0) return;

    setResending(true);
    setResendMessage('');

    try {
      const response = await fetch(
        `${env.VITE_API_URL}/api/auth/resend-confirmation`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message || data.error || 'Unable to resend confirmation email.'
        );
      }

      setResendMessage(
        data.message || 'If confirmation is required, a new email has been sent.'
      );
      setResendCooldown(60);

      const interval = window.setInterval(() => {
        setResendCooldown((current) => {
          if (current <= 1) {
            window.clearInterval(interval);
            return 0;
          }
          return current - 1;
        });
      }, 1000);
    } catch (err) {
      setResendMessage(
        err instanceof Error ? err.message : 'Unable to resend confirmation email.'
      );
    } finally {
      setResending(false);
    }
  };

  if (needsConfirmation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Check Your Email</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-gray-600 mb-4">
              We&apos;ve sent a confirmation link to <strong>{email}</strong>.
            </p>
            <p className="text-gray-600 mb-6">
              Please check your inbox (and spam folder) and click the link to verify your account.
            </p>

            <Button
              variant="primary"
              onClick={handleResendConfirmation}
              loading={resending}
              disabled={resending || resendCooldown > 0}
              className="w-full"
            >
              {resendCooldown > 0
                ? `Resend available in ${resendCooldown}s`
                : 'Resend Confirmation Email'}
            </Button>

            {resendMessage && (
              <p className="mt-3 text-sm text-gray-600" role="status" aria-live="polite">
                {resendMessage}
              </p>
            )}

            <Button
              variant="secondary"
              onClick={() => setNeedsConfirmation(false)}
              className="mt-3 w-full"
            >
              Back to Sign Up
            </Button>

            <p className="mt-4 text-center text-sm text-gray-600">
              Already confirmed your account?{' '}
              <Link
                to="/login"
                className="text-brand-primary hover:underline"
              >
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Create Account</CardTitle>
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
              autoComplete="new-password"
              required
              minLength={8}
            />
            <Input
              type="password"
              label="Confirm Password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" variant="primary" className="w-full" loading={loading}>
              Create Account
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
