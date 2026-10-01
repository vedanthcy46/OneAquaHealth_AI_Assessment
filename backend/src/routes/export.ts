import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { fhirAdapter } from '../services/fhir';

export async function exportRoutes(app: FastifyInstance) {
  // GET /export/fhir/:observationId — FHIR R4 Observation resource
  app.get('/fhir/:observationId', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { observationId } = req.params as any;

    const [obsRes, aiRes, reviewRes] = await Promise.all([
      db.query('SELECT * FROM observations WHERE id = $1', [observationId]),
      db.query('SELECT * FROM ai_results WHERE observation_id = $1', [observationId]),
      db.query('SELECT * FROM human_reviews WHERE observation_id = $1', [observationId]),
    ]);

    if (!obsRes.rows.length) return reply.status(404).send({ success: false, error: 'Observation not found', code: 'NOT_FOUND' });

    const fhir = fhirAdapter.toFHIRObservation(
      obsRes.rows[0],
      aiRes.rows[0] ?? null,
      reviewRes.rows[0] ?? null
    );

    return reply
      .header('Content-Type', 'application/fhir+json')
      .send(fhir);
  });

  // GET /export/csv/:siteId — export verified observations as CSV
  app.get('/csv/:siteId', { onRequest: [app.authenticate, app.requireRole('reviewer', 'admin')] }, async (req, reply) => {
    const { siteId } = req.params as any;
    const res = await db.query(`
      SELECT
        o.id, o.observed_at, o.status, o.quality_score,
        o.lat, o.lng, o.gps_accuracy_m,
        o.env_observations->>'waterClarity' AS water_clarity,
        o.env_observations->>'odour'        AS odour,
        o.env_observations->>'debris'       AS debris,
        o.env_observations->>'flowRate'     AS flow_rate,
        ar.confidence   AS ai_confidence,
        hr.decision     AS reviewer_decision
      FROM observations o
      LEFT JOIN ai_results ar ON ar.observation_id = o.id
      LEFT JOIN human_reviews hr ON hr.observation_id = o.id
      WHERE o.site_id = $1
        AND o.status IN ('ACCEPTED','CORRECTED')
      ORDER BY o.observed_at DESC
    `, [siteId]);

    const headers = ['id','observed_at','status','quality_score','lat','lng','gps_accuracy_m',
                     'water_clarity','odour','debris','flow_rate','ai_confidence','reviewer_decision'];
    const csv = [
      headers.join(','),
      ...res.rows.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(',')),
    ].join('\n');

    return reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="site-${siteId}-observations.csv"`)
      .send(csv);
  });

  // GET /export/geojson/:siteId — GeoJSON feature collection
  app.get('/geojson/:siteId', async (req, reply) => {
    const { siteId } = req.params as any;
    const res = await db.query(`
      SELECT o.id, o.observed_at, o.status, o.quality_score,
             o.env_observations, o.lat, o.lng,
             ar.confidence AS ai_confidence
      FROM observations o
      LEFT JOIN ai_results ar ON ar.observation_id = o.id
      WHERE o.site_id = $1 AND o.status IN ('ACCEPTED','CORRECTED','VALID')
      ORDER BY o.observed_at DESC
    `, [siteId]);

    const geojson = {
      type: 'FeatureCollection',
      features: res.rows
        .filter(r => r.lat && r.lng)
        .map(r => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
          properties: {
            id: r.id,
            observedAt: r.observed_at,
            status: r.status,
            qualityScore: r.quality_score,
            aiConfidence: r.ai_confidence,
            ...r.env_observations,
          },
        })),
    };

    return reply.header('Content-Type', 'application/geo+json').send(geojson);
  });
}
