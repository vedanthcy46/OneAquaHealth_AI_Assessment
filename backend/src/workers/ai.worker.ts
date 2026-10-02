import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { connection } from './queue';
import { db } from '../db';
import { stateMachine } from '../services/stateMachine';
import { auditService } from '../services/audit';
import { env } from '../config/env';
import { v4 as uuidv4 } from 'uuid';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

const execFileAsync = promisify(execFile);

// Helper to download an image URL to a temporary local file for OpenCV
async function downloadToTempFile(url: string): Promise<string> {
  const tempPath = path.join(__dirname, `../../temp_${uuidv4()}.jpg`);
  const file = fs.createWriteStream(tempPath);

  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(tempPath);
      });
    }).on('error', (err) => {
      fs.unlink(tempPath, () => {});
      reject(err);
    });
  });
}


// Improved version using child_process spawn for clean stdin writing
async function spawnPythonPipeline(payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const pythonBin = path.join(__dirname, '../../../ai/.venv/Scripts/python.exe');
    const cp = require('child_process').spawn(pythonBin, ['-m', 'ai.service'], {
      cwd: path.join(__dirname, '../../../'),
    });

    let stdout = '';
    let stderr = '';

    cp.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    cp.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    cp.on('close', (code: number) => {
      if (code === 0 || code === 1) { // 1 means safe review_required per service.py
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          reject(new Error(`Failed to parse Python output: ${stdout}\nStderr: ${stderr}`));
        }
      } else {
        reject(new Error(`Python process exited with ${code}. Stderr: ${stderr}`));
      }
    });

    cp.stdin.write(JSON.stringify(payload));
    cp.stdin.end();
  });
}

// ─── Job: quality-check ───────────────────────────────────────────────────────
async function processQualityCheck(job: Job) {
  const { observationId, mediaId } = job.data;
  const start = Date.now();

  await db.query(`UPDATE media SET analysis_status = 'PROCESSING' WHERE id = $1`, [mediaId]);

  const mediaRes = await db.query('SELECT url FROM media WHERE id = $1', [mediaId]);
  if (!mediaRes.rows.length) throw new Error(`Media ${mediaId} not found`);

  // Download image for Python OpenCV
  const tempPath = await downloadToTempFile(mediaRes.rows[0].url);

  try {
    const result = await spawnPythonPipeline({
      observation_id: observationId,
      image: tempPath
    });

    const q = result.layer_a || { quality_score: 50 };

    await db.query(`
      UPDATE media SET
        quality_score = $1,
        quality_factors = $2,
        quality_suggestions = $3,
        analysis_status = 'COMPLETE'
      WHERE id = $4
    `, [
      q.quality_score,
      JSON.stringify(q.factors || {}),
      JSON.stringify(q.suggestions || []),
      mediaId,
    ]);

    await db.query('UPDATE observations SET quality_score = $1, updated_at = NOW() WHERE id = $2', [q.quality_score, observationId]);

    await auditService.log({
      observationId,
      action: 'ai_quality_check',
      actorType: 'ai',
      output: { score: q.quality_score, factors: q.factors },
      confidence: q.quality_score / 100,
      metadata: { mediaId, processingMs: Date.now() - start },
    });
  } finally {
    fs.unlink(tempPath, () => {});
  }
}

// ─── Job: analyze-observation ─────────────────────────────────────────────────
async function processAnalysis(job: Job) {
  const { observationId } = job.data;
  const start = Date.now();

  await stateMachine.transition(observationId, 'AI_CHECK', { triggeredBy: 'ai' });

  const [obsRes, mediaRes] = await Promise.all([
    db.query('SELECT * FROM observations WHERE id = $1', [observationId]),
    db.query('SELECT id, url, quality_score FROM media WHERE observation_id = $1 ORDER BY created_at LIMIT 1', [observationId]),
  ]);

  if (!obsRes.rows.length) throw new Error(`Observation ${observationId} not found`);
  const obs = obsRes.rows[0];
  const primaryMedia = mediaRes.rows[0];

  if (!primaryMedia) {
    await stateMachine.transition(observationId, 'REVIEW_REQUIRED', { triggeredBy: 'ai', reason: 'No media' });
    return;
  }

  const tempPath = await downloadToTempFile(primaryMedia.url);

  try {
    const result = await spawnPythonPipeline({
      observation_id: observationId,
      image: tempPath,
      citizen_answers: obs.env_observations || {},
      gps_accuracy_m: obs.gps_accuracy_m
    });

    const aiResultId = uuidv4();
    const score = result.confidence_score || 50;
    const routing = result.routing || 'HUMAN_REVIEW';

    await db.transaction(async (client) => {
      await client.query(`
        INSERT INTO ai_results
          (id, observation_id, model, model_version, prompt_version,
           confidence, explanation, validation_warnings, routing_decision, processing_ms)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (observation_id) DO UPDATE SET
          confidence = EXCLUDED.confidence,
          explanation = EXCLUDED.explanation,
          validation_warnings = EXCLUDED.validation_warnings,
          routing_decision = EXCLUDED.routing_decision
      `, [
        aiResultId, observationId,
        result.audit?.model_used || 'python_pipeline', '1.0', result.audit?.prompt_version || 'v1',
        score, JSON.stringify(result.layer_d?.explanation || {}),
        JSON.stringify(result.layer_d?.conflicts || []), routing,
        Date.now() - start,
      ]);

      if (result.layer_b?.evidence) {
        for (const e of result.layer_b.evidence) {
          await client.query(`
            INSERT INTO ai_evidence (ai_result_id, indicator, present, confidence, reasoning, source_media_id, image_region, model)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          `, [
            aiResultId, e.indicator, String(e.present), e.confidence, e.reasoning,
            primaryMedia.id, JSON.stringify(e.imageRegion || null), 'python_pipeline'
          ]);
        }
      }

      if (result.layer_c?.questions) {
        for (const [idx, q] of result.layer_c.questions.entries()) {
          await client.query(`
            INSERT INTO followup_questions (ai_result_id, question_key, question_text, indicator_type, display_order)
            VALUES ($1,$2,$3,$4,$5)
          `, [aiResultId, q.key || `q${idx}`, q.text, q.indicator || 'general', idx]);
        }
      }
    });

    const nextState = routing === 'VALID' ? 'VALID'
      : routing === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED'
      : 'HUMAN_REVIEW';

    await stateMachine.transition(observationId, nextState, {
      triggeredBy: 'ai',
      reason: `Python AI: ${routing}`,
    });

    await auditService.log({
      observationId,
      action: 'ai_analysis_complete',
      actorType: 'ai',
      output: { routing, confidence: score },
      confidence: score / 100,
    });
  } finally {
    fs.unlink(tempPath, () => {});
  }
}

// ─── Worker Setup ─────────────────────────────────────────────────────────────
const worker = new Worker('ai-processing', async (job: Job) => {
  console.log(`[Worker] Processing ${job.name}:${job.id}`);
  if (job.name === 'quality-check') await processQualityCheck(job);
  else if (job.name === 'analyze-observation') await processAnalysis(job);
}, { connection, concurrency: 1 }); // Python loads models, so concurrency 1 is safer

worker.on('completed', (job) => console.log(`[Worker] ✅ Job ${job.name}:${job.id} done`));
worker.on('failed', (job, err) => console.error(`[Worker] ❌ Job ${job?.name} failed:`, err.message));

console.log('🤖 AquaGuard AI Worker watching queue: ai-processing');
