import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { validateUpload, processUpload } from '../services/imageProcessing';
import { uploadUserPhoto, uploadTempFile } from '../services/storage';
import { uploadRateLimiter, apiRateLimiter } from '../middleware/rateLimit';
import { authenticate } from '../middleware/auth';
import { DEFAULT_UPLOAD_CONFIG } from '../shared/types';
import { jsonSchema } from '../lib/schema';

const uploadQuerySchema = z.object({
  temp: z.coerce.boolean().default(false),
});

export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/upload - Upload user photo
  app.post<{ Querystring: z.infer<typeof uploadQuerySchema> }>(
    '/api/upload',
    {
      preHandler: [authenticate, uploadRateLimiter],
      schema: {
        querystring: jsonSchema(uploadQuerySchema),
        response: {
          200: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              path: { type: 'string' },
              width: { type: 'number' },
              height: { type: 'number' },
              format: { type: 'string' },
              size: { type: 'number' },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
          413: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
          429: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' }, retryAfter: { type: 'number' } } },
        },
      },
    },
    async (request, reply) => {
      const { temp } = request.query;
      const userId = request.user?.id || 'guest';

      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }

      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Validate
      const validation = await validateUpload(buffer, data.mimetype);
      if (!validation.valid) {
        return reply.code(400).send({ error: validation.error });
      }

      // Process (strip EXIF, convert to PNG)
      const processed = await processUpload(buffer, data.mimetype);

      // Upload
      let result;
      if (temp) {
        result = await uploadTempFile(processed.buffer, processed.mimeType);
      } else {
        result = await uploadUserPhoto(userId, processed.buffer, processed.mimeType);
      }

      return {
        url: result.url,
        path: result.path,
        width: processed.width,
        height: processed.height,
        format: processed.format,
        size: processed.buffer.length,
      };
    }
  );

  // GET /api/upload/config - Get upload configuration
  app.get('/api/upload/config', {
    preHandler: [apiRateLimiter],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            maxBytes: { type: 'number' },
            maxPixels: { type: 'number' },
            allowedMimeTypes: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  }, async (_request: FastifyRequest, _reply: FastifyReply) => {
    return {
      maxBytes: DEFAULT_UPLOAD_CONFIG.maxBytes,
      maxPixels: DEFAULT_UPLOAD_CONFIG.maxPixels,
      allowedMimeTypes: DEFAULT_UPLOAD_CONFIG.allowedMimeTypes,
    };
  });
}
