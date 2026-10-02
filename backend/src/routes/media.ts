import { FastifyInstance } from 'fastify';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
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

    // Check observation exists and belongs to user
    const obs = await db.query('SELECT observer_id, status FROM observations WHERE id = $1', [id]);
    if (!obs.rows.length) return reply.status(404).send({ success: false, error: 'Observation not found', code: 'NOT_FOUND' });

    // Check for duplicate by hash
    if (hash) {
      const dup = await db.query('SELECT id FROM media WHERE hash = $1 AND observation_id != $2', [hash, id]);
      if (dup.rows.length) {
        return reply.send({
          success: true,
          data: {
            duplicate: true,
            existingMediaId: dup.rows[0].id,
            message: 'An identical image has already been uploaded',
          },
        });
      }
    }

    const { uploadUrl, key, publicUrl } = await storageService.getPresignedUploadUrl(id, mimeType);
    const mediaId = uuidv4();

    // Pre-register media row (status PENDING)
    await db.query(`
      INSERT INTO media (id, observation_id, url, hash, mime_type, file_size_bytes, analysis_status)
      VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
    `, [mediaId, id, publicUrl, hash ?? `pending-${mediaId}`, mimeType, fileSize ?? null]);

    return reply.send({
      success: true,
      data: { mediaId, uploadUrl, key, publicUrl, duplicate: false, expiresAt: new Date(Date.now() + 3600000) },
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

  // POST /observations/:id/media/upload — direct image/video upload with disk storage & media table recording
  app.post('/:id/media/upload', async (req, reply) => {
    const { id } = req.params as any;
    const body = req.body as any;

    let buffer: Buffer;
    let mimeType = body.mimeType || 'image/jpeg';

    if (body.dataUrl) {
      const matches = body.dataUrl.match(/^data:([A-Za-z-+\/0-9]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(body.dataUrl, 'base64');
      }
    } else if (body.base64) {
      buffer = Buffer.from(body.base64, 'base64');
    } else {
      return reply.status(400).send({ success: false, error: 'No media data provided' });
    }

    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const ext = mimeType.includes('video') ? 'mp4' : (mimeType.includes('png') ? 'png' : 'jpg');
    const mediaId = uuidv4();
    const filename = `${id}_${mediaId}.${ext}`;
    const filePath = path.join(uploadsDir, filename);

    fs.writeFileSync(filePath, buffer);

    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const publicUrl = `http://localhost:${process.env.PORT || 3001}/uploads/${filename}`;
    const fileSize = buffer.length;

    // Insert record into PostgreSQL media table matching schema.sql
    try {
      await db.query(`
        INSERT INTO media (
          id, observation_id, url, hash, mime_type, file_size_bytes,
          quality_score, quality_factors, analysis_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'COMPLETE')
        ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url
      `, [
        mediaId,
        id,
        publicUrl,
        hash,
        mimeType,
        fileSize,
        body.qualityScore || 90,
        JSON.stringify(body.qualityFactors || {}),
      ]);
    } catch (dbErr) {
      req.log.warn({ dbErr }, 'Could not insert into media DB table, saved file to disk');
    }

    return reply.send({
      success: true,
      data: {
        mediaId,
        url: publicUrl,
        hash,
        mimeType,
        fileSizeBytes: fileSize,
        status: 'COMPLETE'
      }
    });
  });
}
