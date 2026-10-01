import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { CreateSiteSchema, UpdateSiteSchema, SiteQuerySchema } from '../schemas';
import { anomalyService } from '../services/anomaly';

// Haversine distance in km (works without PostGIS)
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function siteRoutes(app: FastifyInstance) {
  // GET /sites
  app.get('/', async (req, reply) => {
    const parsed = SiteQuerySchema.safeParse(req.query);
    if (!parsed.success)
      return reply.status(400).send({ success: false, error: 'Invalid query', code: 'VALIDATION_ERROR' });

    const { bbox, city, page, limit } = parsed.data;
    const offset = (page - 1) * limit;
    const conditions: string[] = ['s.is_active = true'];
    const params: any[] = [];

    if (bbox) {
      const [lng1, lat1, lng2, lat2] = bbox.split(',').map(Number);
      params.push(Math.min(lat1, lat2), Math.max(lat1, lat2), Math.min(lng1, lng2), Math.max(lng1, lng2));
      conditions.push(
        `s.lat BETWEEN $${params.length - 3} AND $${params.length - 2}`,
        `s.lng BETWEEN $${params.length - 1} AND $${params.length}`
      );
    }
    if (city) {
      params.push(`%${city}%`);
      conditions.push(`s.city ILIKE $${params.length}`);
    }

    const where = conditions.join(' AND ');
    params.push(limit, offset);

    const [sites, total] = await Promise.all([
      db.query(`
        SELECT s.*,
               COUNT(o.id)::int AS observation_count
        FROM sites s
        LEFT JOIN observations o ON o.site_id = s.id
        WHERE ${where}
        GROUP BY s.id
        ORDER BY s.name
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `, params),
      db.query(
        `SELECT COUNT(*) FROM sites s WHERE ${where}`,
        params.slice(0, -2)
      ),
    ]);

    return reply.send({
      success: true,
      data: sites.rows,
      meta: {
        total: parseInt(total.rows[0].count),
        page,
        limit,
        hasMore: offset + limit < parseInt(total.rows[0].count),
      },
    });
  });

  // GET /sites/:id
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as any;
    const res = await db.query(`
      SELECT s.*,
             COUNT(o.id)::int AS observation_count,
             COUNT(o.id) FILTER (WHERE o.status IN ('ACCEPTED','CORRECTED'))::int AS verified_count
      FROM sites s
      LEFT JOIN observations o ON o.site_id = s.id
      WHERE s.id = $1
      GROUP BY s.id
    `, [id]);

    if (!res.rows.length)
      return reply.status(404).send({ success: false, error: 'Site not found', code: 'NOT_FOUND' });
    return reply.send({ success: true, data: res.rows[0] });
  });

  // POST /sites — reviewer/admin only
  app.post(
    '/',
    { onRequest: [app.authenticate, app.requireRole('reviewer', 'admin')] },
    async (req, reply) => {
      const parsed = CreateSiteSchema.safeParse(req.body);
      if (!parsed.success)
        return reply.status(400).send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });

      const { lat, lng, name, description, waterbody, city, country, metadata } = parsed.data;
      const { sub } = req.user as any;
      const id = uuidv4();

      await db.query(`
        INSERT INTO sites (id, name, description, lat, lng, waterbody, city, country, metadata, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [id, name, description ?? null, lat, lng, waterbody ?? null, city ?? null, country, JSON.stringify(metadata ?? {}), sub]);

      return reply.status(201).send({ success: true, data: { id } });
    }
  );

  // PATCH /sites/:id
  app.patch(
    '/:id',
    { onRequest: [app.authenticate, app.requireRole('reviewer', 'admin')] },
    async (req, reply) => {
      const { id } = req.params as any;
      const parsed = UpdateSiteSchema.safeParse(req.body);
      if (!parsed.success)
        return reply.status(400).send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR' });

      const fields = parsed.data;
      const sets: string[] = [];
      const params: any[] = [];

      if (fields.name)        { params.push(fields.name);        sets.push(`name = $${params.length}`); }
      if (fields.description) { params.push(fields.description); sets.push(`description = $${params.length}`); }
      if (fields.city)        { params.push(fields.city);        sets.push(`city = $${params.length}`); }
      if (fields.lat != null) { params.push(fields.lat);         sets.push(`lat = $${params.length}`); }
      if (fields.lng != null) { params.push(fields.lng);         sets.push(`lng = $${params.length}`); }

      if (!sets.length)
        return reply.status(400).send({ success: false, error: 'No fields to update', code: 'NO_CHANGES' });

      params.push(id);
      await db.query(
        `UPDATE sites SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
        params
      );
      return reply.send({ success: true, data: { updated: true } });
    }
  );

  // GET /sites/:id/nearby  — find sites within N km using Haversine (no PostGIS)
  app.get('/:id/nearby', async (req, reply) => {
    const { id } = req.params as any;
    const { radiusKm = 5 } = req.query as any;

    const siteRes = await db.query('SELECT lat, lng FROM sites WHERE id = $1', [id]);
    if (!siteRes.rows.length)
      return reply.status(404).send({ success: false, error: 'Site not found', code: 'NOT_FOUND' });

    const { lat, lng } = siteRes.rows[0];
    // Rough bounding box first, then filter by Haversine in JS
    const latDelta = Number(radiusKm) / 111;
    const lngDelta = Number(radiusKm) / (111 * Math.cos((lat * Math.PI) / 180));

    const res = await db.query(`
      SELECT * FROM sites
      WHERE id != $1
        AND is_active = true
        AND lat BETWEEN $2 AND $3
        AND lng BETWEEN $4 AND $5
    `, [id, lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta]);

    const nearby = res.rows.filter(
      (s: any) => haversineKm(lat, lng, s.lat, s.lng) <= Number(radiusKm)
    );

    return reply.send({ success: true, data: nearby });
  });

  // GET /sites/:id/timeline
  app.get('/:id/timeline', async (req, reply) => {
    const { id } = req.params as any;
    const { weeks = 12 } = req.query as any;
    const timeline = await anomalyService.getSiteTimeline(id, parseInt(String(weeks)));
    return reply.send({ success: true, data: timeline });
  });

  // GET /sites/:id/trends
  app.get('/:id/trends', async (req, reply) => {
    const { id } = req.params as any;
    const trends = await anomalyService.getSiteTrends(id);
    return reply.send({ success: true, data: trends });
  });

  // GET /sites/:id/alerts
  app.get('/:id/alerts', async (req, reply) => {
    const { id } = req.params as any;
    const res = await db.query(
      'SELECT * FROM site_alerts WHERE site_id = $1 AND is_resolved = false ORDER BY created_at DESC',
      [id]
    );
    return reply.send({ success: true, data: res.rows });
  });
}
