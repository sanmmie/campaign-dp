/**
 * Request paths whose values must never reach the log stream. Session
 * cookies, bearer tokens and CSRF tokens are credentials: a single log line
 * containing them would let anyone with log access impersonate a supporter.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.Authorization',
  'req.headers.cookie',
  'req.headers.Cookie',
  'req.headers["x-csrf-token"]',
  'req.headers["X-CSRF-Token"]',
  'res.headers["set-cookie"]',
  'res.headers["Set-Cookie"]',
  'req.body',
  'body',
] as const;

export const REDACTED_PLACEHOLDER = '[REDACTED]';

export interface ServerLoggerOptions {
  level: string;
  redact: {
    paths: string[];
    censor: string;
  };
  transport?: { target: string };
}

/**
 * Builds the logger options used by the server so the redaction rules can be
 * asserted in tests instead of being duplicated inline.
 */
export function createLoggerOptions(nodeEnv: string): ServerLoggerOptions {
  const isProduction = nodeEnv === 'production';

  return {
    level: isProduction ? 'info' : 'debug',
    redact: {
      paths: [...REDACTED_PATHS],
      censor: REDACTED_PLACEHOLDER,
    },
    transport: isProduction ? undefined : { target: 'pino-pretty' },
  };
}
