/**
 * Verifies that the environment a deployment runs with satisfies the
 * production policy. It reports variable names and verdicts only: values are
 * never printed so the output is safe to paste into an incident report.
 *
 * Usage: npm run check:config
 */
import { envSchema } from '../src/config/env';

type Check = {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
};

const checks: Check[] = [];
const record = (name: string, status: Check['status'], detail: string) => {
  checks.push({ name, status, detail });
};

const PLACEHOLDER_PATTERN = /^(anon|svc|test|changeme|placeholder|your[-_].*|xxx+)$/i;

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return false;
  return PLACEHOLDER_PATTERN.test(value.trim());
}

function main(): void {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const fields = Object.keys(parsed.error.flatten().fieldErrors);
    record('env schema', 'fail', `missing or invalid: ${fields.join(', ')}`);
  } else {
    record('env schema', 'ok', 'all declared variables are present and valid');
  }

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  record(
    'NODE_ENV',
    nodeEnv === 'production' ? 'ok' : 'fail',
    nodeEnv === 'production' ? 'production' : `expected production, found ${nodeEnv}`
  );

  const frontendUrl = process.env.FRONTEND_URL ?? '';
  record(
    'FRONTEND_URL',
    frontendUrl.startsWith('https://') ? 'ok' : 'fail',
    frontendUrl.startsWith('https://')
      ? 'https origin, required for secure cross-site cookies'
      : 'must be an https origin in production'
  );

  const supabaseUrl = process.env.SUPABASE_URL ?? '';
  record(
    'SUPABASE_URL',
    supabaseUrl.startsWith('https://') ? 'ok' : 'fail',
    supabaseUrl.startsWith('https://') ? 'https origin' : 'must be an https origin'
  );

  const databaseUrl = process.env.DATABASE_URL ?? '';
  const dbLooksLocal = /^file:/i.test(databaseUrl) || /localhost|127\.0\.0\.1/.test(databaseUrl);
  record(
    'DATABASE_URL',
    dbLooksLocal ? 'fail' : 'ok',
    dbLooksLocal ? 'points at a local database' : 'points at a remote database'
  );

  for (const secret of [
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'JWT_SECRET',
    'COOKIE_SECRET',
    'PAYSTACK_SECRET_KEY',
  ]) {
    const value = process.env[secret];
    if (!value) {
      record(secret, 'warn', 'not set');
      continue;
    }
    record(
      secret,
      isPlaceholder(value) ? 'fail' : 'ok',
      isPlaceholder(value) ? 'still contains a placeholder value' : 'set'
    );
  }

  if (process.env.PAYSTACK_SECRET_KEY && !process.env.PAYSTACK_PUBLIC_KEY) {
    record('PAYSTACK_PUBLIC_KEY', 'fail', 'secret key present without the public key');
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  record(
    'ADMIN_EMAILS',
    adminEmails.length > 0 ? 'ok' : 'warn',
    adminEmails.length > 0
      ? `${adminEmails.length} administrator account(s) configured`
      : 'no platform administrator configured'
  );

  const failures = checks.filter((check) => check.status === 'fail');
  const warnings = checks.filter((check) => check.status === 'warn');

  for (const check of checks) {
    const marker = check.status === 'ok' ? 'PASS' : check.status === 'warn' ? 'WARN' : 'FAIL';
    console.log(`${marker}  ${check.name.padEnd(26)} ${check.detail}`);
  }

  console.log(
    `\n${checks.length - failures.length - warnings.length} passed, ${warnings.length} warning(s), ${failures.length} failure(s)`
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main();
