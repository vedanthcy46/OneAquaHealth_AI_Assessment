import fp from 'fastify-plugin';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { UserRole } from '../types';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (...roles: UserRole[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const authMiddleware = fp(async (app: FastifyInstance) => {
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch (err) {
      reply.status(401).send({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
  });

  app.decorate('requireRole', (...roles: UserRole[]) =>
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = req.user as any;
      if (!user || !roles.includes(user.role)) {
        reply.status(403).send({ success: false, error: 'Insufficient permissions', code: 'FORBIDDEN' });
      }
    }
  );
});
