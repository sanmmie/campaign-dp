import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_REGION: z.string().default('us-east-1'),
  JWT_SECRET: z.string().min(32),
  ADMIN_EMAILS: z.string().transform(s => s.split(',').map(e => e.trim()).filter(Boolean)),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  UPLOAD_MAX_BYTES: z.coerce.number().default(10 * 1024 * 1024),
  UPLOAD_MAX_PIXELS: z.coerce.number().default(40 * 1000 * 1000),
  CAMPAIGN_PACK_ID: z.string().min(1),
  CAMPAIGN_AUTHORIZED_BY: z.string().optional(),
  CAMPAIGN_DISCLAIMER: z.string().default('User-generated campaign material. Not an official communication.'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  REDIS_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  cachedEnv = result.data;
  return cachedEnv;
}

export const env = getEnv();