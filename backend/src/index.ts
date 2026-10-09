import 'dotenv/config';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import { env } from './config/env';
import { prisma } from './db/prisma';
import { authenticate } from './middleware/auth';
import { authRoutes } from './routes/auth';
import { profileRoutes } from './routes/profile';
import { uploadRoutes } from './routes/upload';
import { shareRoutes } from './routes/share';
import { projectRoutes } from './routes/projects';
import { packRoutes } from './routes/packs';
import { generateRoutes } from './routes/generate';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        env.NODE_ENV === 'production'
          ? undefined
          : { target: 'pino-pretty' },
    },
    trustProxy: true,
  });

  // Register plugins
  await app.register(fastifyCors, {
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false,
  });

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: env.UPLOAD_MAX_BYTES,
      files: 1,
    },
  });

  await app.register(fastifyRateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    allowList: ['/api/health'],
  });

  // Global auth hook (sets request.user if token present)
  app.addHook('preHandler', authenticate);

  // Health check
  app.get('/api/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            database: { type: 'string' },
          },
        },
      },
    },
  }, async () => {
    let dbStatus = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
    }
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbStatus,
    };
  });

  // Register route modules
  await authRoutes(app);
  await profileRoutes(app);
  await uploadRoutes(app);
  await shareRoutes(app);
  await projectRoutes(app);
  await packRoutes(app);
  await generateRoutes(app);

  // 404 handler
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply.code(404).send({
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
    });
  });

  // Error handler
  app.setErrorHandler((error: Error & { code?: string; statusCode?: number }, request: FastifyRequest, reply: FastifyReply) => {
    request.log.error(error);

    if (error.code === 'FST_ERR_VALIDATION') {
      return reply.code(400).send({
        error: 'Validation Error',
        message: error.message,
      });
    }

    if (error.code === 'FST_ERR_FILE_SIZE_LIMIT') {
      return reply.code(413).send({
        error: 'File Too Large',
        message: 'Upload exceeds maximum file size',
      });
    }

    // Errors flagged by Fastify with a client status (e.g. malformed JSON)
    if (
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      return reply.code(error.statusCode).send({
        error: 'Bad Request',
        message:
          env.NODE_ENV === 'production' ? 'Invalid request' : error.message,
      });
    }

    reply.code(500).send({
      error: 'Internal Server Error',
      message: env.NODE_ENV === 'production' ? 'Something went wrong' : error.message,
    });
  });

  return app;
}
