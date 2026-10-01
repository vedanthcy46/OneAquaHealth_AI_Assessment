import { FastifyInstance } from 'fastify';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { LoginSchema, RegisterSchema } from '../schemas';

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/register
  app.post('/register', async (req, reply) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }
    const { email, password, displayName } = parsed.data;

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      return reply.status(409).send({ success: false, error: 'Email already registered', code: 'EMAIL_EXISTS' });
    }

    const hash = await bcrypt.hash(password, 10);
    const id   = uuidv4();
    await db.query(
      'INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, $3, $4)',
      [id, email, hash, displayName ?? null]
    );

    const token = app.jwt.sign({ sub: id, email, role: 'citizen' });
    return reply.status(201).send({ success: true, data: { token, userId: id, role: 'citizen' } });
  });

  // POST /auth/login
  app.post('/login', async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR' });
    }
    const { email, password } = parsed.data;

    const res = await db.query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email]);
    if (!res.rows.length) {
      return reply.status(401).send({ success: false, error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }
    const user = res.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ success: false, error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
    const token = app.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return reply.send({
      success: true,
      data: { token, userId: user.id, role: user.role, displayName: user.display_name },
    });
  });

  // GET /auth/me
  app.get('/me', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { sub } = req.user as any;
    const res = await db.query(
      'SELECT id, email, display_name, role, created_at FROM users WHERE id = $1',
      [sub]
    );
    if (!res.rows.length) return reply.status(404).send({ success: false, error: 'User not found', code: 'NOT_FOUND' });
    return reply.send({ success: true, data: res.rows[0] });
  });

  // POST /auth/change-password
  app.post('/change-password', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { currentPassword, newPassword } = req.body as any;
    const { sub } = req.user as any;
    const res = await db.query('SELECT password_hash FROM users WHERE id = $1', [sub]);
    const valid = await bcrypt.compare(currentPassword, res.rows[0].password_hash);
    if (!valid) return reply.status(400).send({ success: false, error: 'Current password incorrect', code: 'WRONG_PASSWORD' });
    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, sub]);
    return reply.send({ success: true, data: { message: 'Password updated' } });
  });
}
