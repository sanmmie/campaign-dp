import { z } from 'zod';

export const envSchema = z.object({
  VITE_API_URL: z.string().url().default('http://localhost:3001'),
  VITE_SUPABASE_URL: z.string().default(''),
  VITE_SUPABASE_ANON_KEY: z.string().default(''),
  VITE_FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  VITE_SENTRY_DSN: z.string().optional(),
  VITE_GA_MEASUREMENT_ID: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

const fallback: Env = {
  VITE_API_URL: 'http://localhost:3001',
  VITE_SUPABASE_URL: '',
  VITE_SUPABASE_ANON_KEY: '',
  VITE_FRONTEND_URL: 'http://localhost:5173',
};

const result = envSchema.safeParse(import.meta.env);

export const env: Env = result.success ? result.data : fallback;
