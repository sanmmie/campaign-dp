import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';

let supabaseAuth: SupabaseClient | null = null;

function getSupabaseAuth(): SupabaseClient {
  if (!supabaseAuth) {
    supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return supabaseAuth;
}

export interface ResendConfirmationResult {
  ok: boolean;
  providerError?: string;
}

/**
 * Requests a new Supabase signup confirmation email.
 *
 * The provider error is returned internally but must NOT be sent to the
 * client, as it could reveal whether an email address is registered.
 */
export async function resendSignupConfirmation(
  email: string
): Promise<ResendConfirmationResult> {
  const normalizedEmail = email.trim().toLowerCase();

  const { error } = await getSupabaseAuth().auth.resend({
    type: 'signup',
    email: normalizedEmail,
    options: {
      emailRedirectTo: `${env.FRONTEND_URL}/login`,
    },
  });

  if (error) {
    return {
      ok: false,
      providerError: error.message,
    };
  }

  return { ok: true };
}
