import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import pino from 'pino';
import { Writable } from 'node:stream';
import { createLoggerOptions, REDACTED_PATHS, REDACTED_PLACEHOLDER } from './logger';

/**
 * Production logs are readable by anyone with dashboard access, so session
 * cookies, bearer tokens and CSRF tokens must never be written to them.
 */

function captureStream() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { stream, lines };
}

function captureLogger(nodeEnv = 'production') {
  const { stream, lines } = captureStream();
  const options = createLoggerOptions(nodeEnv);
  // The pretty transport is a development convenience only; production logs
  // are plain JSON, so the capture uses the plain pino stream.
  return { loggerOptions: { ...options, transport: undefined, stream }, lines };
}

describe('Phase 10 — log hygiene', () => {
  it('keeps request credentials out of the server request log', async () => {
    const { loggerOptions, lines } = captureLogger();

    const app = Fastify({ logger: loggerOptions });
    app.get('/api/probe', async () => ({ ok: true }));
    await app.ready();

    await app.inject({
      method: 'GET',
      url: '/api/probe',
      headers: {
        authorization: 'Bearer super-secret-access-token',
        cookie: 'access_token=secret-cookie-value; refresh_token=secret-refresh-value',
        'x-csrf-token': 'secret-csrf-token',
      },
    });

    await app.close();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const output = lines.join('');
    expect(output).not.toContain('super-secret-access-token');
    expect(output).not.toContain('secret-cookie-value');
    expect(output).not.toContain('secret-refresh-value');
    expect(output).not.toContain('secret-csrf-token');
  });

  it('redacts credential headers that reach the log stream', async () => {
    const { stream, lines } = captureStream();
    const logger = pino(
      { ...createLoggerOptions('production'), transport: undefined },
      stream
    );

    logger.info(
      {
        req: {
          method: 'GET',
          url: '/api/probe',
          headers: {
            authorization: 'Bearer super-secret-access-token',
            cookie: 'access_token=secret-cookie-value',
            'x-csrf-token': 'secret-csrf-token',
          },
        },
      },
      'incoming request'
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    const output = lines.join('');
    expect(output).not.toContain('super-secret-access-token');
    expect(output).not.toContain('secret-cookie-value');
    expect(output).not.toContain('secret-csrf-token');
    expect(output).toContain(REDACTED_PLACEHOLDER);
  });

  it('keeps the request path for operational debugging', async () => {
    const { loggerOptions, lines } = captureLogger();

    const app = Fastify({ logger: loggerOptions });
    app.get('/api/probe', async () => ({ ok: true }));
    await app.ready();

    await app.inject({ method: 'GET', url: '/api/probe' });
    await app.close();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(lines.join('')).toContain('/api/probe');
  });

  it('covers the credential-bearing header paths', () => {
    expect(REDACTED_PATHS).toContain('req.headers.authorization');
    expect(REDACTED_PATHS).toContain('req.headers.cookie');
    expect(REDACTED_PATHS).toContain('req.headers["x-csrf-token"]');
    expect(REDACTED_PATHS).toContain('res.headers["set-cookie"]');
  });

  it('uses plain JSON logging in production and pretty logging otherwise', () => {
    expect(createLoggerOptions('production').transport).toBeUndefined();
    expect(createLoggerOptions('development').transport).toEqual({
      target: 'pino-pretty',
    });
  });
});
