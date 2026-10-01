import { db } from '../db';

interface AuditEntry {
  observationId?: string;
  action: string;
  actorType: 'ai' | 'citizen' | 'reviewer' | 'system';
  actorId?: string;
  model?: string;
  modelVersion?: string;
  promptVersion?: string;
  inputHash?: string;
  output?: Record<string, any>;
  confidence?: number;
  humanDecision?: string;
  correctionReason?: string;
  metadata?: Record<string, any>;
}

export class AuditService {
  async log(entry: AuditEntry): Promise<void> {
    try {
      await db.query(
        `INSERT INTO audit_logs
          (observation_id, action, actor_type, actor_id, model, model_version,
           prompt_version, input_hash, output, confidence, human_decision,
           correction_reason, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          entry.observationId ?? null,
          entry.action,
          entry.actorType,
          entry.actorId ?? null,
          entry.model ?? null,
          entry.modelVersion ?? null,
          entry.promptVersion ?? null,
          entry.inputHash ?? null,
          entry.output ? JSON.stringify(entry.output) : null,
          entry.confidence ?? null,
          entry.humanDecision ?? null,
          entry.correctionReason ?? null,
          JSON.stringify(entry.metadata ?? {}),
        ]
      );
    } catch (err) {
      // Audit failures must never crash the main flow
      console.error('[AuditService] Failed to write audit log:', err);
    }
  }

  async getForObservation(observationId: string) {
    const result = await db.query(
      `SELECT * FROM audit_logs WHERE observation_id = $1 ORDER BY created_at ASC`,
      [observationId]
    );
    return result.rows;
  }
}

export const auditService = new AuditService();
