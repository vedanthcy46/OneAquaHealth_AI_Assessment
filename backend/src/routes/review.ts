import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { ReviewSchema, ReviewQueueQuerySchema } from '../schemas';
import { stateMachine } from '../services/stateMachine';
import { auditService } from '../services/audit';

export async function reviewRoutes(app: FastifyInstance) {
  // GET /review/queue — paginated, filterable review queue
  app.get('/queue', { onRequest: [app.authenticate, app.requireRole('reviewer', 'admin')] }, async (req, reply) => {
    const parsed = ReviewQueueQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Invalid query', code: 'VALIDATION_ERROR' });

    const { minConfidence, maxConfidence, siteId, page, limit } = parsed.data;
    const offset = (page - 1) * limit;
    const conditions: string[] = [`o.status IN ('REVIEW_REQUIRED','HUMAN_REVIEW')`];
    const params: any[] = [];

    if (minConfidence !== undefined) { params.push(minConfidence); conditions.push(`ar.confidence >= $${params.length}`); }
    if (maxConfidence !== undefined) { params.push(maxConfidence); conditions.push(`ar.confidence <= $${params.length}`); }
    if (siteId)                      { params.push(siteId);        conditions.push(`o.site_id = $${params.length}`); }

    const where = conditions.join(' AND ');
    params.push(limit, offset);

    const res = await db.query(`
      SELECT
        o.id, o.status, o.observed_at, o.submitted_at, o.quality_score,
        o.env_observations, o.lat, o.lng,
        s.name AS site_name, s.city,
        ar.confidence, ar.routing_decision, ar.validation_warnings,
        u.display_name AS observer_name,
        COUNT(m.id)::int AS media_count
      FROM observations o
      LEFT JOIN sites s ON s.id = o.site_id
      LEFT JOIN ai_results ar ON ar.observation_id = o.id
      LEFT JOIN users u ON u.id = o.observer_id
      LEFT JOIN media m ON m.observation_id = o.id
      WHERE ${where}
      GROUP BY o.id, s.name, s.city, ar.confidence, ar.routing_decision, ar.validation_warnings, u.display_name
      ORDER BY ar.confidence ASC NULLS LAST, o.submitted_at ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const countRes = await db.query(`
      SELECT COUNT(*) FROM observations o
      LEFT JOIN ai_results ar ON ar.observation_id = o.id
      WHERE ${where}
    `, params.slice(0, -2));

    return reply.send({
      success: true,
      data: res.rows,
      meta: { total: parseInt(countRes.rows[0].count), page, limit, hasMore: offset + limit < parseInt(countRes.rows[0].count) },
    });
  });

  // GET /review/queue/stats — dashboard stat counts
  app.get('/queue/stats', { onRequest: [app.authenticate, app.requireRole('reviewer', 'admin')] }, async (req, reply) => {
    const res = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('REVIEW_REQUIRED','HUMAN_REVIEW')) AS pending,
        COUNT(*) FILTER (WHERE status = 'ACCEPTED' AND updated_at > NOW() - INTERVAL '1 day') AS accepted_today,
        COUNT(*) FILTER (WHERE status = 'REJECTED') AS rejected_total,
        COUNT(*) FILTER (WHERE status = 'CORRECTED') AS corrected_total
      FROM observations
    `);
    const alerts = await db.query(`SELECT COUNT(*) FROM site_alerts WHERE is_resolved = false`);
    return reply.send({
      success: true,
      data: {
        ...res.rows[0],
        open_alerts: parseInt(alerts.rows[0].count),
      },
    });
  });

  // GET /assessments/:id — full observation detail for reviewer
  app.get('/assessments/:id', { onRequest: [app.authenticate, app.requireRole('reviewer', 'admin')] }, async (req, reply) => {
    const { id } = req.params as any;

    const [obs, media, aiResult, evidence, questions, history, review] = await Promise.all([
      db.query(`
        SELECT o.*, s.name AS site_name, s.city, u.display_name AS observer_name
        FROM observations o
        LEFT JOIN sites s ON s.id = o.site_id
        LEFT JOIN users u ON u.id = o.observer_id
        WHERE o.id = $1
      `, [id]),
      db.query('SELECT * FROM media WHERE observation_id = $1 ORDER BY created_at', [id]),
      db.query('SELECT * FROM ai_results WHERE observation_id = $1', [id]),
      db.query(`SELECT ae.* FROM ai_evidence ae JOIN ai_results ar ON ar.id = ae.ai_result_id WHERE ar.observation_id = $1`, [id]),
      db.query(`SELECT fq.* FROM followup_questions fq JOIN ai_results ar ON ar.id = fq.ai_result_id WHERE ar.observation_id = $1 ORDER BY fq.display_order`, [id]),
      db.query(`
        SELECT o.id, o.observed_at, o.env_observations, o.status, o.quality_score
        FROM observations o
        WHERE o.site_id = (SELECT site_id FROM observations WHERE id = $1)
          AND o.id != $1
          AND o.status IN ('ACCEPTED','CORRECTED')
        ORDER BY o.observed_at DESC
        LIMIT 5
      `, [id]),
      db.query('SELECT * FROM human_reviews WHERE observation_id = $1', [id]),
    ]);

    if (!obs.rows.length) return reply.status(404).send({ success: false, error: 'Not found', code: 'NOT_FOUND' });

    return reply.send({
      success: true,
      data: {
        observation: obs.rows[0],
        media: media.rows,
        aiResult: aiResult.rows[0] ?? null,
        evidence: evidence.rows,
        questions: questions.rows,
        siteHistory: history.rows,
        existingReview: review.rows[0] ?? null,
      },
    });
  });

  // POST /assessments/:id/review — submit review decision
  app.post('/assessments/:id/review', { onRequest: [app.authenticate, app.requireRole('reviewer', 'admin')] }, async (req, reply) => {
    const { id } = req.params as any;
    const { sub } = req.user as any;
    const parsed = ReviewSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });

    const { decision, corrections, reason } = parsed.data;

    // Load current data
    const [obsRes, aiRes] = await Promise.all([
      db.query('SELECT env_observations, status FROM observations WHERE id = $1', [id]),
      db.query('SELECT * FROM ai_results WHERE observation_id = $1', [id]),
    ]);
    if (!obsRes.rows.length) return reply.status(404).send({ success: false, error: 'Not found', code: 'NOT_FOUND' });
    if (!['REVIEW_REQUIRED', 'HUMAN_REVIEW'].includes(obsRes.rows[0].status)) {
      return reply.status(409).send({ success: false, error: 'Observation not in reviewable state', code: 'INVALID_STATE' });
    }

    const citizenObservation = obsRes.rows[0].env_observations;
    const aiAssessment = aiRes.rows[0] ? { confidence: aiRes.rows[0].confidence, evidence: [] } : null;
    const humanAssessment = corrections ?? citizenObservation;
    const finalAssessment = decision === 'CORRECTED' ? humanAssessment : citizenObservation;

    await db.transaction(async (client) => {
      // Store human review (separate from citizen + AI data)
      await client.query(`
        INSERT INTO human_reviews
          (observation_id, reviewer_id, decision, citizen_observation, ai_assessment, human_assessment, final_assessment, reason)
        VALUES ($1, $2, $3::review_decision, $4, $5, $6, $7, $8)
        ON CONFLICT (observation_id) DO UPDATE SET
          decision = EXCLUDED.decision,
          human_assessment = EXCLUDED.human_assessment,
          final_assessment = EXCLUDED.final_assessment,
          reason = EXCLUDED.reason,
          reviewer_id = EXCLUDED.reviewer_id,
          reviewed_at = NOW()
      `, [id, sub, decision, JSON.stringify(citizenObservation), JSON.stringify(aiAssessment),
          JSON.stringify(humanAssessment), JSON.stringify(finalAssessment), reason]);

      // Transition state
      const toState = decision === 'ACCEPTED' ? 'ACCEPTED'
        : decision === 'CORRECTED' ? 'CORRECTED'
        : decision === 'REJECTED' ? 'REJECTED'
        : 'RESUBMIT_REQUESTED';

      await client.query(
        'UPDATE observations SET status = $1::obs_status, updated_at = NOW() WHERE id = $2',
        [toState, id]
      );
      await client.query(`
        INSERT INTO observation_state_transitions (observation_id, from_state, to_state, triggered_by, actor_id, reason)
        VALUES ($1, $2::obs_status, $3::obs_status, 'reviewer', $4, $5)
      `, [id, obsRes.rows[0].status, toState, sub, reason]);
    });

    await auditService.log({
      observationId: id,
      action: `review_${decision.toLowerCase()}`,
      actorType: 'reviewer',
      actorId: sub,
      humanDecision: decision,
      correctionReason: reason,
      output: { corrections },
    });

    return reply.send({ success: true, data: { decision, finalState: decision, message: `Observation ${decision.toLowerCase()}` } });
  });
}
