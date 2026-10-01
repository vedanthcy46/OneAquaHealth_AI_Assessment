import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { connection } from './queue';
import { db } from '../db';
import { stateMachine } from '../services/stateMachine';
import { confidenceService } from '../services/confidence';
import { validationService } from '../services/validation';
import { auditService } from '../services/audit';
import { env } from '../config/env';
import { v4 as uuidv4 } from 'uuid';

// ─── AI Safety Policy: patterns the AI must never return ─────────────────────
const FORBIDDEN_PATTERNS = [
  /water is safe to drink/i,
  /will cause (disease|illness|infection)/i,
  /pollution confirmed/i,
  /definitely.*contaminated/i,
  /guaranteed.*unsafe/i,
];

function enforceSafetyPolicy(text: string): void {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error(`AI output violates safety policy: matched pattern ${pattern}`);
    }
  }
}

// ─── AI Gateway ───────────────────────────────────────────────────────────────
async function callVisionModel(prompt: string, imageUrl?: string): Promise<string> {
  if (env.AI_PROVIDER === 'gemini' && env.GEMINI_API_KEY) {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    enforceSafetyPolicy(text);
    return text;
  }

  if (env.AI_PROVIDER === 'openai' && env.OPENAI_API_KEY) {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const msg: any = { role: 'user', content: prompt };
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [msg],
      max_tokens: 1000,
    });
    const text = res.choices[0]?.message?.content ?? '';
    enforceSafetyPolicy(text);
    return text;
  }

  // Fallback mock for local dev without API keys
  return JSON.stringify({
    quality: { blurScore: 75, brightnessScore: 80, occlusionScore: 85, streamRelevanceScore: 90, overallScore: 82, suggestions: [] },
    evidence: [
      { indicator: 'turbidity', present: 'false', confidence: 0.3, reasoning: 'Water appears clear', imageRegion: null },
      { indicator: 'vegetation_presence', present: 'true', confidence: 0.85, reasoning: 'Bankside vegetation visible', imageRegion: { x: 0, y: 0, w: 0.3, h: 1 } },
    ],
  });
}

// ─── Job: quality-check ───────────────────────────────────────────────────────
async function processQualityCheck(job: Job) {
  const { observationId, mediaId } = job.data;
  const start = Date.now();

  await db.query(`UPDATE media SET analysis_status = 'PROCESSING' WHERE id = $1`, [mediaId]);

  const mediaRes = await db.query('SELECT url, hash FROM media WHERE id = $1', [mediaId]);
  if (!mediaRes.rows.length) throw new Error(`Media ${mediaId} not found`);

  const prompt = `You are an ecological image quality assessor. Evaluate this stream photograph at ${mediaRes.rows[0].url}.

Return ONLY valid JSON with this exact schema:
{
  "quality": {
    "blurScore": <0-100>,
    "brightnessScore": <0-100>,
    "occlusionScore": <0-100>,
    "streamRelevanceScore": <0-100>,
    "overallScore": <0-100>,
    "suggestions": ["<actionable tip if score<70>"]
  }
}

Rules:
- blurScore: 0=very blurry, 100=sharp
- brightnessScore: 0=too dark or overexposed, 100=well-lit
- occlusionScore: 0=heavily occluded, 100=clear view
- streamRelevanceScore: 0=no water visible, 100=water clearly central
- overallScore: weighted average (blur 30%, brightness 20%, occlusion 20%, relevance 30%)
- suggestions: brief, actionable (e.g. "Step back 2m to reduce foreground obstruction")
- DO NOT mention disease, pollution, or make health claims`;

  const raw = await callVisionModel(prompt, mediaRes.rows[0].url);

  let parsed: any;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    parsed = { quality: { blurScore: 60, brightnessScore: 60, occlusionScore: 60, streamRelevanceScore: 60, overallScore: 60, suggestions: [] } };
  }

  const q = parsed.quality;
  const score = Math.round(q.overallScore ?? (q.blurScore * 0.3 + q.brightnessScore * 0.2 + q.occlusionScore * 0.2 + q.streamRelevanceScore * 0.3));

  await db.query(`
    UPDATE media SET
      quality_score = $1,
      quality_factors = $2,
      quality_suggestions = $3,
      analysis_status = 'COMPLETE'
    WHERE id = $4
  `, [
    score,
    JSON.stringify({ blur: q.blurScore, brightness: q.brightnessScore, occlusion: q.occlusionScore, streamRelevance: q.streamRelevanceScore }),
    JSON.stringify(q.suggestions ?? []),
    mediaId,
  ]);

  await db.query('UPDATE observations SET quality_score = $1, updated_at = NOW() WHERE id = $2', [score, observationId]);

  await auditService.log({
    observationId,
    action: 'ai_quality_check',
    actorType: 'ai',
    model: env.AI_PROVIDER,
    modelVersion: '1.0',
    promptVersion: 'quality-v1.0',
    output: { score, factors: parsed.quality },
    confidence: score / 100,
    metadata: { mediaId, processingMs: Date.now() - start },
  });
}

// ─── Job: analyze-observation ─────────────────────────────────────────────────
async function processAnalysis(job: Job) {
  const { observationId } = job.data;
  const start = Date.now();

  // Transition to AI_CHECK
  await stateMachine.transition(observationId, 'AI_CHECK', { triggeredBy: 'ai' });

  const [obsRes, mediaRes] = await Promise.all([
    db.query(`
      SELECT o.*, ST_Y(o.gps::geometry) AS lat, ST_X(o.gps::geometry) AS lng
      FROM observations o WHERE o.id = $1
    `, [observationId]),
    db.query(`SELECT id, url, quality_score FROM media WHERE observation_id = $1 ORDER BY created_at LIMIT 3`, [observationId]),
  ]);

  if (!obsRes.rows.length) throw new Error(`Observation ${observationId} not found`);
  const obs = obsRes.rows[0];
  const mediaList = mediaRes.rows;

  // ── Evidence Detection Prompt (Layer B) ──────────────────────────────────
  const evidencePrompt = `You are an ecological field assessment assistant supporting citizen science.
Analyse the uploaded stream photograph(s) scientifically and conservatively.

URLs: ${mediaList.map(m => m.url).join(', ')}

For EACH indicator below, determine if it is visually observable:
- turbidity: water appears cloudy or murky
- floating_debris: visible litter, leaves, or foam
- algae_bloom: green or blue-green surface coverage
- vegetation_presence: bankside or in-channel plants
- concrete_channel: artificial concrete channelisation
- natural_channel: natural banks or substrate
- foam_presence: persistent white foam on surface
- water_color_anomaly: brown, orange, or grey discolouration
- low_water_flow: stagnant or very slow movement
- high_water_flow: fast or turbulent flow

Return ONLY valid JSON (no prose):
{
  "evidence": [
    {
      "indicator": "<name>",
      "present": "true" | "false" | "uncertain",
      "confidence": <0.0-1.0>,
      "reasoning": "<one sentence of observable fact only>",
      "imageRegion": { "x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0 } | null
    }
  ]
}

STRICT RULES:
- State ONLY what is visually observable in the image
- Do NOT claim water is "polluted", "contaminated", or "unsafe"
- Do NOT make disease or health claims
- Do NOT express certainty beyond what the image shows
- Use "uncertain" when image quality prevents a confident reading`;

  const evidenceRaw = await callVisionModel(evidencePrompt);

  let evidenceParsed: { evidence: any[] };
  try {
    const jsonMatch = evidenceRaw.match(/\{[\s\S]*\}/);
    evidenceParsed = JSON.parse(jsonMatch ? jsonMatch[0] : evidenceRaw);
  } catch {
    evidenceParsed = { evidence: [] };
  }

  // ── Adaptive Questions (Layer C) ─────────────────────────────────────────
  const QUESTION_BANK = [
    { key: 'water_clarity_depth', text: 'Can you see the streambed through the water?', indicator: 'turbidity', order: 1 },
    { key: 'water_clarity_level', text: 'How would you describe the water: clear, slightly cloudy, or very cloudy?', indicator: 'turbidity', order: 2 },
    { key: 'debris_source',       text: 'Is the material floating continuously or only in one small area?', indicator: 'floating_debris', order: 1 },
    { key: 'debris_type',         text: 'What type of material is floating? (leaves / litter / foam / other)', indicator: 'floating_debris', order: 2 },
    { key: 'algae_coverage',      text: 'What percentage of the water surface appears covered by green material?', indicator: 'algae_bloom', order: 1 },
    { key: 'foam_persistence',    text: 'Has the foam been present throughout your visit, or did it appear recently?', indicator: 'foam_presence', order: 1 },
    { key: 'odour_general',       text: 'Can you detect any unusual smell? (none / earthy / chemical / sewage)', indicator: 'general', order: 1 },
    { key: 'flow_estimate',       text: 'How fast does the water appear to be flowing?', indicator: 'low_water_flow', order: 1 },
    { key: 'channel_substrate',   text: 'Is the streambed natural rock/gravel or concrete/artificial?', indicator: 'concrete_channel', order: 1 },
    { key: 'vegetation_health',   text: 'Does the bankside vegetation look healthy or stressed/dying?', indicator: 'vegetation_presence', order: 1 },
  ];

  const detectedIndicators = evidenceParsed.evidence
    .filter(e => e.present === 'true' && e.confidence > 0.6)
    .sort((a: any, b: any) => b.confidence - a.confidence)
    .map((e: any) => e.indicator);

  const selectedQuestions = QUESTION_BANK
    .filter(q => detectedIndicators.includes(q.indicator) || q.indicator === 'general')
    .slice(0, 5);

  // ── Validation (Layer D) ─────────────────────────────────────────────────
  const avgQuality = mediaList.reduce((s, m) => s + (m.quality_score ?? 50), 0) / (mediaList.length || 1);

  const { warnings, requiresReview } = await validationService.validate({
    observationId,
    citizenAnswers: obs.env_observations ?? {},
    evidence: evidenceParsed.evidence.map((e: any) => ({ indicator: e.indicator, confidence: e.confidence, present: e.present })),
    gpsAccuracyM: obs.gps_accuracy_m,
    mediaQualityScore: Math.round(avgQuality),
  });

  // ── Confidence (Layer E) ─────────────────────────────────────────────────
  const { score, factors, routing, explanation } = await confidenceService.calculate({
    mediaQualityScore: Math.round(avgQuality),
    evidence: evidenceParsed.evidence,
    validationWarnings: warnings,
    gpsAccuracyM: obs.gps_accuracy_m,
    siteId: obs.site_id,
  });

  // ── Persist AI Result ─────────────────────────────────────────────────────
  const aiResultId = uuidv4();
  const inputHash = require('crypto').createHash('sha256')
    .update(JSON.stringify({ obs: obs.env_observations, evidence: evidenceParsed.evidence }))
    .digest('hex');

  await db.transaction(async (client) => {
    await client.query(`
      INSERT INTO ai_results
        (id, observation_id, model, model_version, prompt_version, input_hash,
         confidence, confidence_factors, explanation, validation_warnings, routing_decision, processing_ms)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (observation_id) DO UPDATE SET
        confidence = EXCLUDED.confidence,
        confidence_factors = EXCLUDED.confidence_factors,
        explanation = EXCLUDED.explanation,
        validation_warnings = EXCLUDED.validation_warnings,
        routing_decision = EXCLUDED.routing_decision
    `, [
      aiResultId, observationId,
      env.AI_PROVIDER, '1.0', 'evidence-v1.0', inputHash,
      score, JSON.stringify(factors), JSON.stringify(explanation),
      JSON.stringify(warnings), routing,
      Date.now() - start,
    ]);

    // Insert evidence items
    for (const e of evidenceParsed.evidence) {
      const primaryMedia = mediaList[0];
      await client.query(`
        INSERT INTO ai_evidence
          (ai_result_id, indicator, present, confidence, reasoning, source_media_id, image_region, model, model_version)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [
        aiResultId, e.indicator, String(e.present), e.confidence, e.reasoning,
        primaryMedia?.id ?? null,
        e.imageRegion ? JSON.stringify(e.imageRegion) : null,
        env.AI_PROVIDER, '1.0',
      ]);
    }

    // Insert follow-up questions
    for (let idx = 0; idx < selectedQuestions.length; idx++) {
      const q = selectedQuestions[idx];
      await client.query(`
        INSERT INTO followup_questions (ai_result_id, question_key, question_text, indicator_type, display_order)
        VALUES ($1,$2,$3,$4,$5)
      `, [aiResultId, q.key, q.text, q.indicator, idx]);
    }
  });

  // ── Route observation based on confidence ────────────────────────────────
  const nextState = routing === 'VALID' ? 'VALID'
    : routing === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED'
    : 'HUMAN_REVIEW';

  await stateMachine.transition(observationId, nextState, {
    triggeredBy: 'ai',
    reason: `Confidence: ${score}/100 → ${routing}`,
  });

  // Audit trail
  await auditService.log({
    observationId,
    action: 'ai_analysis_complete',
    actorType: 'ai',
    model: env.AI_PROVIDER,
    modelVersion: '1.0',
    promptVersion: 'evidence-v1.0',
    inputHash,
    output: { confidence: score, routing, evidenceCount: evidenceParsed.evidence.length, warningCount: warnings.length },
    confidence: score / 100,
    metadata: { processingMs: Date.now() - start },
  });

  console.log(`[Worker] ✅ Observation ${observationId} analyzed: ${score}/100 → ${routing}`);
}

// ─── Worker Setup ─────────────────────────────────────────────────────────────
const worker = new Worker(
  'ai-processing',
  async (job: Job) => {
    console.log(`[Worker] Processing job: ${job.name} | id: ${job.id}`);
    if (job.name === 'quality-check')        await processQualityCheck(job);
    else if (job.name === 'analyze-observation') await processAnalysis(job);
    else console.warn(`[Worker] Unknown job type: ${job.name}`);
  },
  {
    connection,
    concurrency: 3,
  }
);

worker.on('completed', (job) => console.log(`[Worker] ✅ Job ${job.name}:${job.id} completed`));
worker.on('failed', (job, err) => console.error(`[Worker] ❌ Job ${job?.name}:${job?.id} failed:`, err.message));

console.log('🤖 AquaGuard AI Worker started — watching queue: ai-processing');
