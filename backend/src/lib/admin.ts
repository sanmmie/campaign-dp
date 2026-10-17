import { env } from '../config/env';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAdminEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return env.ADMIN_EMAILS.map(normalizeEmail).includes(normalized);
}

export function isEmailConfirmed(confirmedAt?: string | null): boolean {
  return !!confirmedAt;
}

export function isAdminUser(
  email: string,
  confirmedAt?: string | null
): boolean {
  return isEmailConfirmed(confirmedAt) && isAdminEmail(email);
}
