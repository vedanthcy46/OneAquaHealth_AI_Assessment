import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import {
  CreateObservationSchema,
  UpdateObservationSchema,
  ObservationQuerySchema,
  AnswerQuestionSchema,
} from '../schemas';
import { stateMachine } from '../services/stateMachine';
import { auditService } from '../services/audit';
import { aiQueue } from '../workers/queue';

export async function observationRoutes(app: FastifyInstance) {
  // POST /observations
  app.post('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const parsed = CreateObservationSchema.safeParse(req.body);
    if (!parsed.success)
      return reply.status(400).send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });

    const { siteId, localId, gps, observedAt, envObservations } = parsed.data;
    const { sub } = req.user as any;
    const id = uuidv4();

    await db.query(`
      INSERT INTO observations
        (id, local_id, site_id, observer_id, status, sync_status,
         lat, lng, gps_accuracy_m, observed_at, env_observations)
      VALUES ($1,$2,$3,$4,'DRAFT','SYNCED',$5,$6,$7,$8,$9)
    `, [
      id, localId ?? null, siteId, sub,
      gps.lat, gps.lng, gps.accuracy,
      observedAt,
      JSON.stringify(envObservations ?? {}),
    ]);

    await auditService.log({
      observationId: id,
      action: 'observation_created',
      actorType: 'citizen',
      actorId: sub,
    });

    return reply.status(201).send({ success: true, data: { id, localId, status: 'DRAFT' } });
  });

  // GET /observations
  app.get('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const parsed = ObservationQuerySchema.safeParse(req.query);
    if (!parsed.success)
      return reply.status(400).send({ success: false, error: 'Invalid query', code: 'VALIDATION_ERROR' });

    const { sub, role } = req.user as any;
    const { siteId, status, page, limit } = parsed.data;
    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: any[] = [];

    if (role === 'citizen')  { params.push(sub);    conditions.push(`o.observer_id = $${params.length}`); }
    if (siteId)              { params.push(siteId); conditions.push(`o.site_id = $${params.length}`); }
    if (status)              { params.push(status); conditions.push(`o.status = $${params.length}::obs_status`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const res = await db.query(`
      SELECT o.*, s.name AS site_name
      FROM observations o
      LEFT JOIN sites s ON s.id = o.site_id
      ${where}
      ORDER BY o.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    return reply.send({ success: true, data: res.rows });
  });

  // GET /observations/:id
  app.get('/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as any;
    const { sub, role } = req.user as any;

    const res = await db.query(`
      SELECT o.*, s.name AS site_name, s.city, s.waterbody
      FROM observations o
      LEFT JOIN sites s ON s.id = o.site_id
      WHERE o.id = $1
    `, [id]);

    if (!res.rows.length)
      return reply.status(404).send({ success: false, error: 'Observation not found', code: 'NOT_FOUND' });

    const obs = res.rows[0];
    if (role === 'citizen' && obs.observer_id !== sub)
      return reply.status(403).send({ success: false, error: 'Access denied', code: 'FORBIDDEN' });

    return reply.send({ success: true, data: obs });
  });

  // PATCH /observations/:id
  app.patch('/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as any;
    const { sub } = req.user as any;
    const parsed = UpdateObservationSchema.safeParse(req.body);
    if (!parsed.success)
      return reply.status(400).send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR' });

    const obs = await db.query('SELECT status, observer_id FROM observations WHERE id = $1', [id]);
    if (!obs.rows.length)
      return reply.status(404).send({ success: false, error: 'Not found', code: 'NOT_FOUND' });
    if (obs.rows[0].observer_id !== sub)
      return reply.status(403).send({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
    if (!['DRAFT', 'RESUBMIT_REQUESTED'].includes(obs.rows[0].status))
      return reply.status(409).send({ success: false, error: 'Cannot edit in current state', code: 'INVALID_STATE' });

    await db.query(
      'UPDATE observations SET env_observations = $1, updated_at = NOW(), version = version + 1 WHERE id = $2',
      [JSON.stringify(parsed.data.envObservations ?? {}), id]
    );
    return reply.send({ success: true, data: { updated: true } });
  });

  // POST /observations/:id/submit
  app.post('/:id/submit', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as any;
    const { sub } = req.user as any;

    const obs = await db.query('SELECT status, observer_id FROM observations WHERE id = $1', [id]);
    if (!obs.rows.length)
      return reply.status(404).send({ success: false, error: 'Not found', code: 'NOT_FOUND' });
    if (obs.rows[0].observer_id !== sub)
      return reply.status(403).send({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });

    await stateMachine.transition(id, 'SUBMITTED', { triggeredBy: 'citizen', actorId: sub });
    await db.query('UPDATE observations SET submitted_at = NOW() WHERE id = $1', [id]);

    // Enqueue AI analysis
    await aiQueue.add(
      'analyze-observation',
      { observationId: id },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
    );

    return reply.send({ success: true, data: { status: 'SUBMITTED', message: 'Queued for AI analysis' } });
  });

  // GET /observations/:id/audit
  app.get(
    '/:id/audit',
    { onRequest: [app.authenticate, app.requireRole('reviewer', 'admin')] },
    async (req, reply) => {
      const { id } = req.params as any;
      const [logs, transitions] = await Promise.all([
        db.query('SELECT * FROM audit_logs WHERE observation_id = $1 ORDER BY created_at ASC', [id]),
        db.query('SELECT * FROM observation_state_transitions WHERE observation_id = $1 ORDER BY created_at ASC', [id]),
      ]);
      return reply.send({ success: true, data: { auditLogs: logs.rows, stateTransitions: transitions.rows } });
    }
  );

  // GET /observations/:id/followup-questions
  app.get('/:id/followup-questions', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as any;
    const res = await db.query(`
      SELECT fq.* FROM followup_questions fq
      JOIN ai_results ar ON ar.id = fq.ai_result_id
      WHERE ar.observation_id = $1
      ORDER BY fq.display_order
    `, [id]);
    return reply.send({ success: true, data: res.rows });
  });

  // POST /observations/:id/followup-questions/:key/answer
  app.post('/:id/followup-questions/:key/answer', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id, key } = req.params as any;
    const parsed = AnswerQuestionSchema.safeParse(req.body);
    if (!parsed.success)
      return reply.status(400).send({ success: false, error: 'Invalid answer', code: 'VALIDATION_ERROR' });

    await db.query(`
      UPDATE followup_questions
      SET citizen_answer = $1, answered_at = NOW()
      WHERE question_key = $2
        AND ai_result_id = (SELECT id FROM ai_results WHERE observation_id = $3 LIMIT 1)
    `, [parsed.data.answer, key, id]);

    return reply.send({ success: true, data: { answered: true } });
  });
}
