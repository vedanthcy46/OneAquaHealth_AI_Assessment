import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { env } from './config/env';
import { authMiddleware } from './middleware/auth';

import { authRoutes }        from './routes/auth';
import { siteRoutes }        from './routes/sites';
import { observationRoutes } from './routes/observations';
import { mediaRoutes }       from './routes/media';
import { reviewRoutes }      from './routes/review';
import { exportRoutes }      from './routes/export';
import { aiRoutes }          from './routes/ai';
import { db } from './db';

const app = Fastify({
  bodyLimit: 50 * 1024 * 1024, // 50MB for video and high-res images
  logger: {
    level: env.LOG_LEVEL,
    ...(env.NODE_ENV === 'development' ? {
      transport: { target: 'pino-pretty', options: { colorize: true } },
    } : {}),
  },
});

async function build() {
  // ── Security ──────────────────────────────────────────────────────────────
  await app.register(helmet, { global: true });
  await app.register(cors, {
    origin: [env.FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
  });
  await app.register(rateLimit, {
    max:     env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
  });

  // ── JWT ───────────────────────────────────────────────────────────────────
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  // ── Auth Middleware ───────────────────────────────────────────────────────
  await app.register(authMiddleware);

  // ── Swagger / OpenAPI ─────────────────────────────────────────────────────
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'AquaGuard AI API',
        description: 'AI-assisted environmental assessment system — OneAquaHealth Track 3',
        version: '1.0.0',
        contact: { name: 'AquaGuard Team' },
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list' },
  });

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/health', async () => {
    const dbOk = await db.query('SELECT 1').then(() => true).catch(() => false);
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      db: dbOk ? 'connected' : 'error',
    };
  });

  // ── Serve Uploaded Media ──────────────────────────────────────────────────
  app.get('/uploads/:filename', async (req, reply) => {
    const { filename } = req.params as { filename: string };
    const safeFilename = path.basename(filename);
    const filePath = path.join(process.cwd(), 'uploads', safeFilename);
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ success: false, error: 'File not found' });
    }
    const ext = path.extname(safeFilename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
    };
    reply.header('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(fs.createReadStream(filePath));
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  await app.register(authRoutes,        { prefix: '/auth' });
  await app.register(siteRoutes,        { prefix: '/sites' });
  await app.register(observationRoutes, { prefix: '/observations' });
  await app.register(mediaRoutes,       { prefix: '/observations' });
  await app.register(reviewRoutes,      { prefix: '/review' });
  await app.register(exportRoutes,      { prefix: '/export' });
  await app.register(aiRoutes,          { prefix: '/ai' });

  // ── Global error handler ──────────────────────────────────────────────────
  app.setErrorHandler((error, req, reply) => {
    req.log.error(error);
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({
      success: false,
      error: statusCode === 500 ? 'Internal server error' : error.message,
      code: error.code ?? 'INTERNAL_ERROR',
    });
  });

  // ── 404 ───────────────────────────────────────────────────────────────────
  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({ success: false, error: `Route ${req.method} ${req.url} not found`, code: 'NOT_FOUND' });
  });

  return app;
}

async function start() {
  try {
    const server = await build();
    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`\n🌊 AquaGuard AI API running on port ${env.PORT}`);
    console.log(`📖 Swagger docs: http://localhost:${env.PORT}/docs`);
    console.log(`❤️  Health check: http://localhost:${env.PORT}/health\n`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
