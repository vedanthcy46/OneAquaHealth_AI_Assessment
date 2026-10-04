import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { storageService } from '../services/storage';
import { auditService } from '../services/audit';
import { aiQueue } from '../workers/queue';


export async function mediaRoutes(app: FastifyInstance) {
  // POST /observations/:id/media/presign — get presigned S3 URL
  app.post('/:id/media/presign', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as any;
    const { mimeType = 'image/jpeg', hash, fileSize } = req.body as any;

    // Check observation exists
    const obs = await db.query('SELECT observer_id, status FROM observations WHERE id = $1', [id]);
    if (!obs.rows.length) return reply.status(404).send({ success: false, error: 'Observation not found', code: 'NOT_FOUND' });

    // Check for duplicate by hash
    if (hash) {
      const dup = await db.query('SELECT id FROM media WHERE hash = $1 AND observation_id != $2', [hash, id]);
      if (dup.rows.length) {
        return reply.send({
          success: true,
          data: { duplicate: true, existingMediaId: dup.rows[0].id, message: 'An identical image has already been uploaded' },
        });
      }
    }

    // With Cloudinary active, direct upload is preferred over presigned URLs.
    // Return a hint to use the /upload endpoint instead.
    if (storageService.isCloudinaryEnabled()) {
      return reply.status(400).send({
        success: false,
        error: 'Presigned URLs are not used with Cloudinary. POST to /observations/:id/media/upload with { dataUrl } instead.',
        code: 'USE_DIRECT_UPLOAD',
      });
    }

    // Legacy S3/R2 presign flow — only active when S3 credentials are configured
    return reply.status(501).send({
      success: false,
      error: 'S3 presigned upload not configured. Use direct upload endpoint.',
      code: 'NOT_IMPLEMENTED',
    });
  });

  // POST /observations/:id/media/:mediaId/confirm — called after S3 upload completes
  app.post('/:id/media/:mediaId/confirm', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id, mediaId } = req.params as any;
    const { hash, captureTimestamp, gps } = req.body as any;

    await db.query(`
      UPDATE media SET
        hash = $1,
        capture_timestamp = $2,
        analysis_status = 'PENDING',
        updated_at = NOW()
      WHERE id = $3 AND observation_id = $4
    `, [hash, captureTimestamp ?? null, mediaId, id]);

    // Enqueue quality check job
    await aiQueue.add('quality-check', { observationId: id, mediaId }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    await auditService.log({
      observationId: id,
      action: 'media_uploaded',
      actorType: 'citizen',
      metadata: { mediaId },
    });

    return reply.send({ success: true, data: { mediaId, status: 'PENDING', message: 'Quality check queued' } });
  });

  // GET /observations/:id/media — list all media for observation
  app.get('/:id/media', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as any;
    const res = await db.query(
      'SELECT * FROM media WHERE observation_id = $1 ORDER BY created_at ASC',
      [id]
    );
    return reply.send({ success: true, data: res.rows });
  });

  // GET /observations/:id/media/:mediaId — get single media with quality details
  app.get('/:id/media/:mediaId', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { mediaId } = req.params as any;
    const res = await db.query('SELECT * FROM media WHERE id = $1', [mediaId]);
    if (!res.rows.length) return reply.status(404).send({ success: false, error: 'Media not found', code: 'NOT_FOUND' });
    return reply.send({ success: true, data: res.rows[0] });
  });

  // DELETE /observations/:id/media/:mediaId
  app.delete('/:id/media/:mediaId', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id, mediaId } = req.params as any;
    const { sub } = req.user as any;

    const obs = await db.query('SELECT observer_id FROM observations WHERE id = $1', [id]);
    if (!obs.rows.length || obs.rows[0].observer_id !== sub) {
      return reply.status(403).send({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
    }
    await db.query('DELETE FROM media WHERE id = $1 AND observation_id = $2', [mediaId, id]);
    return reply.send({ success: true, data: { deleted: true } });
  });

  // POST /observations/:id/media/upload — direct upload (Cloudinary in prod, disk in dev)
  app.post('/:id/media/upload', async (req, reply) => {
    const { id } = req.params as any;
    const body = req.body as any;

    const dataUrl: string | undefined = body.dataUrl || body.base64;
    if (!dataUrl) {
      return reply.status(400).send({ success: false, error: 'No media data provided (send dataUrl or base64)' });
    }

    const mimeType: string = body.mimeType || 'image/jpeg';

    let result;
    try {
      result = await storageService.uploadMedia(id, dataUrl, mimeType, {
        qualityScore:   body.qualityScore,
        qualityFactors: body.qualityFactors,
      });
    } catch (uploadErr: any) {
      req.log.error({ uploadErr }, 'Media upload failed');
      return reply.status(500).send({ success: false, error: 'Upload failed: ' + (uploadErr.message ?? uploadErr) });
    }

    // Insert record into PostgreSQL media table
    try {
      await db.query(`
        INSERT INTO media (
          id, observation_id, url, public_id, hash, mime_type, file_size_bytes,
          quality_score, quality_factors, analysis_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'COMPLETE')
        ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url, public_id = EXCLUDED.public_id
      `, [
        result.mediaId,
        id,
        result.url,
        result.publicId ?? null,
        result.hash,
        result.mimeType,
        result.fileSizeBytes,
        body.qualityScore || 90,
        JSON.stringify(body.qualityFactors || {}),
      ]);
    } catch (dbErr) {
      req.log.warn({ dbErr }, 'Media uploaded to storage but failed to insert into DB');
    }

    return reply.send({
      success: true,
      data: {
        mediaId:       result.mediaId,
        url:           result.url,
        hash:          result.hash,
        mimeType:      result.mimeType,
        fileSizeBytes: result.fileSizeBytes,
        status:        'COMPLETE',
        storage:       storageService.isCloudinaryEnabled() ? 'cloudinary' : 'local',
      }
    });
  });
}
