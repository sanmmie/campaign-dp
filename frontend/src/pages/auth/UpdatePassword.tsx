import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { useToast } from '../../hooks/useToast';
import { env } from '../../config/env';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseBrowser: SupabaseClient | null = null;

function getSupabaseBrowser(): SupabaseClient {
  if (!supabaseBrowser) {
    supabaseBrowser = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: true,
      },
    });
  }
  return supabaseBrowser;
}

export function UpdatePassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasValidSession, setHasValidSession] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    let cancelled = false;

    async function checkRecoverySession() {
      try {
        const supabase = getSupabaseBrowser();

        // detectSessionInUrl automatically reads the recovery access_token
        // from the URL hash and sets up a single-use recovery session.
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (!cancelled) {
          if (error || !session) {
            setHasValidSession(false);
          } else {
            setHasValidSession(true);
          }
        }
      } catch {
        if (!cancelled) {
          setHasValidSession(false);
        }
      }
    }

    checkRecoverySession();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!hasValidSession) {
      setError('Invalid or expired reset session');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const supabase = getSupabaseBrowser();

      // Use the recovery session (set by detectSessionInUrl from the URL hash)
      // to update the password. This invalidates the recovery session after use.
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw new Error(updateError.message || 'Failed to update password');
      }

      addToast({ message: 'Password updated! Please sign in.', type: 'success' });
      setTimeout(() => {
        window.location.href = '/login';
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update password';
      setError(message);
      addToast({ message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (!hasValidSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Invalid or Expired Link</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-gray-600 mb-4">
              This password reset link is invalid or has expired.
            </p>
            <p className="text-gray-600 mb-6">
              Please request a new password reset link.
            </p>
            <Link to="/reset-password" className="inline-block">
              <Button variant="primary">Request New Link</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Set New Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="password"
              label="New Password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <Input
              type="password"
              label="Confirm New Password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" variant="primary" className="w-full" loading={loading}>
              Update Password
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-gray-600">
            <Link to="/login" className="text-brand-primary hover:underline">
              Back to Sign In
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
