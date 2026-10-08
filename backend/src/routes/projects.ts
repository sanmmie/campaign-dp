import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/prisma';
import { authenticate } from '../middleware/auth';
import { apiRateLimiter } from '../middleware/rateLimit';
import { jsonSchema } from '../lib/schema';

const createProjectSchema = z.object({
  packId: z.string(),
  templateId: z.string(),
  templateVersion: z.number().int().positive(),
  templateSnapshot: z.any(),
  photoUrl: z.string().url().nullable().optional(),
  photoTransform: z.any().optional(),
  textValues: z.record(z.string()).default({}),
  editorState: z.any().optional(),
  exportSettings: z.any().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().optional(),
  photoUrl: z.string().url().nullable().optional(),
  photoTransform: z.any().optional(),
  textValues: z.record(z.string()).optional(),
  editorState: z.any().optional(),
  exportSettings: z.any().optional(),
});

const projectParamsSchema = z.object({
  projectId: z.string(),
});

const projectListQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/projects - Create project
  app.post<{ Body: z.infer<typeof createProjectSchema> }>(
    '/api/projects',
    {
      preHandler: [apiRateLimiter, authenticate],
      schema: {
        body: jsonSchema(createProjectSchema),
        response: {
          201: { type: 'object' },
          400: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
          401: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const body = request.body;
      const userId = request.user?.id || null;

      // For guest users, we still allow creation but don't associate with user
      const project = await prisma.project.create({
        data: {
          userId,
          packId: body.packId,
          templateId: body.templateId,
          templateVersion: body.templateVersion,
          templateSnapshot: JSON.stringify(body.templateSnapshot),
          photoUrl: body.photoUrl || null,
          photoTransform: body.photoTransform
            ? JSON.stringify(body.photoTransform)
            : null,
          textValues: JSON.stringify(body.textValues),
          editorState: body.editorState
            ? JSON.stringify(body.editorState)
            : '{}',
          exportSettings: body.exportSettings
            ? JSON.stringify(body.exportSettings)
            : '{}',
        },
      });

      return reply.code(201).send({
        id: project.id,
        userId: project.userId,
        packId: project.packId,
        templateId: project.templateId,
        templateVersion: project.templateVersion,
        templateSnapshot: JSON.parse(project.templateSnapshot),
        photoUrl: project.photoUrl,
        photoTransform: project.photoTransform
          ? JSON.parse(project.photoTransform)
          : null,
        textValues: JSON.parse(project.textValues),
        editorState: JSON.parse(project.editorState),
        exportSettings: JSON.parse(project.exportSettings),
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      });
    }
  );

  // GET /api/projects - List user's projects
  app.get<{ Querystring: z.infer<typeof projectListQuerySchema> }>(
    '/api/projects',
    {
      preHandler: [apiRateLimiter, authenticate],
      schema: {
        querystring: jsonSchema(projectListQuerySchema),
        response: {
          200: {
            type: 'object',
            properties: {
              projects: { type: 'array' },
              total: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      const userId = request.user?.id || null;
      const { limit = 50, offset = 0 } = request.query;

      const where = userId ? { userId } : { userId: null };

      const [projects, total] = await Promise.all([
        prisma.project.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.project.count({ where }),
      ]);

      return {
        projects: projects.map((p) => ({
          id: p.id,
          userId: p.userId,
          packId: p.packId,
          templateId: p.templateId,
          templateVersion: p.templateVersion,
          templateSnapshot: JSON.parse(p.templateSnapshot),
          photoUrl: p.photoUrl,
          photoTransform: p.photoTransform
            ? JSON.parse(p.photoTransform)
            : null,
          textValues: JSON.parse(p.textValues),
          editorState: JSON.parse(p.editorState),
          exportSettings: JSON.parse(p.exportSettings),
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        })),
        total,
      };
    }
  );

  // GET /api/projects/:projectId - Get project
  app.get<{ Params: z.infer<typeof projectParamsSchema> }>(
    '/api/projects/:projectId',
    {
      preHandler: [apiRateLimiter, authenticate],
      schema: {
        params: jsonSchema(projectParamsSchema),
        response: {
          200: { type: 'object' },
          404: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { projectId } = request.params;
      const userId = request.user?.id || null;

      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        return reply.code(404).send({ error: 'Project not found' });
      }

      // Check ownership (guests can only access their own guest projects)
      if (project.userId !== userId) {
        return reply.code(404).send({ error: 'Project not found' });
      }

      return {
        id: project.id,
        userId: project.userId,
        packId: project.packId,
        templateId: project.templateId,
        templateVersion: project.templateVersion,
        templateSnapshot: JSON.parse(project.templateSnapshot),
        photoUrl: project.photoUrl,
        photoTransform: project.photoTransform
          ? JSON.parse(project.photoTransform)
          : null,
        textValues: JSON.parse(project.textValues),
        editorState: JSON.parse(project.editorState),
        exportSettings: JSON.parse(project.exportSettings),
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      };
    }
  );

  // PUT /api/projects/:projectId - Update project
  app.put<{
    Params: z.infer<typeof projectParamsSchema>;
    Body: z.infer<typeof updateProjectSchema>;
  }>(
    '/api/projects/:projectId',
    {
      preHandler: [apiRateLimiter, authenticate],
      schema: {
        params: jsonSchema(projectParamsSchema),
        body: jsonSchema(updateProjectSchema),
        response: {
          200: { type: 'object' },
          404: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { projectId } = request.params;
      const body = request.body;
      const userId = request.user?.id || null;

      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project || project.userId !== userId) {
        return reply.code(404).send({ error: 'Project not found' });
      }

      const updated = await prisma.project.update({
        where: { id: projectId },
        data: {
          photoUrl: body.photoUrl ?? project.photoUrl,
          photoTransform: body.photoTransform
            ? JSON.stringify(body.photoTransform)
            : project.photoTransform,
          textValues: body.textValues
            ? JSON.stringify(body.textValues)
            : project.textValues,
          editorState: body.editorState
            ? JSON.stringify(body.editorState)
            : project.editorState,
          exportSettings: body.exportSettings
            ? JSON.stringify(body.exportSettings)
            : project.exportSettings,
        },
      });

      return {
        id: updated.id,
        userId: updated.userId,
        packId: updated.packId,
        templateId: updated.templateId,
        templateVersion: updated.templateVersion,
        templateSnapshot: JSON.parse(updated.templateSnapshot),
        photoUrl: updated.photoUrl,
        photoTransform: updated.photoTransform
          ? JSON.parse(updated.photoTransform)
          : null,
        textValues: JSON.parse(updated.textValues),
        editorState: JSON.parse(updated.editorState),
        exportSettings: JSON.parse(updated.exportSettings),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    }
  );

  // DELETE /api/projects/:projectId - Delete project
  app.delete<{ Params: z.infer<typeof projectParamsSchema> }>(
    '/api/projects/:projectId',
    {
      preHandler: [apiRateLimiter, authenticate],
      schema: {
        params: jsonSchema(projectParamsSchema),
        response: {
          204: { type: 'null' },
          404: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { projectId } = request.params;
      const userId = request.user?.id || null;

      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project || project.userId !== userId) {
        return reply.code(404).send({ error: 'Project not found' });
      }

      await prisma.project.delete({ where: { id: projectId } });
      return reply.code(204).send();
    }
  );

  // POST /api/projects/:projectId/duplicate - Duplicate project
  app.post<{ Params: z.infer<typeof projectParamsSchema> }>(
    '/api/projects/:projectId/duplicate',
    {
      preHandler: [apiRateLimiter, authenticate],
      schema: {
        params: jsonSchema(projectParamsSchema),
        response: {
          201: { type: 'object' },
          404: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { projectId } = request.params;
      const userId = request.user?.id || null;

      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project || project.userId !== userId) {
        return reply.code(404).send({ error: 'Project not found' });
      }

      const duplicated = await prisma.project.create({
        data: {
          userId,
          packId: project.packId,
          templateId: project.templateId,
          templateVersion: project.templateVersion,
          templateSnapshot: project.templateSnapshot,
          photoUrl: project.photoUrl,
          photoTransform: project.photoTransform,
          textValues: project.textValues,
          editorState: project.editorState,
          exportSettings: project.exportSettings,
        },
      });

      return reply.code(201).send({
        id: duplicated.id,
        userId: duplicated.userId,
        packId: duplicated.packId,
        templateId: duplicated.templateId,
        templateVersion: duplicated.templateVersion,
        templateSnapshot: JSON.parse(duplicated.templateSnapshot),
        photoUrl: duplicated.photoUrl,
        photoTransform: duplicated.photoTransform
          ? JSON.parse(duplicated.photoTransform)
          : null,
        textValues: JSON.parse(duplicated.textValues),
        editorState: JSON.parse(duplicated.editorState),
        exportSettings: JSON.parse(duplicated.exportSettings),
        createdAt: duplicated.createdAt.toISOString(),
        updatedAt: duplicated.updatedAt.toISOString(),
      });
    }
  );
}
