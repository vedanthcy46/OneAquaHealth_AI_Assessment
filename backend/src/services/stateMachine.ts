import { db } from '../db';
import { ObsStatus } from '../types';

// Valid state transitions
const TRANSITIONS: Record<ObsStatus, ObsStatus[]> = {
  DRAFT:               ['SUBMITTED'],
  SUBMITTED:           ['AI_CHECK'],
  AI_CHECK:            ['VALID', 'REVIEW_REQUIRED', 'HUMAN_REVIEW'],
  VALID:               ['ACCEPTED'],
  REVIEW_REQUIRED:     ['HUMAN_REVIEW', 'VALID'],
  HUMAN_REVIEW:        ['ACCEPTED', 'CORRECTED', 'REJECTED', 'RESUBMIT_REQUESTED'],
  ACCEPTED:            [],
  CORRECTED:           [],
  REJECTED:            [],
  RESUBMIT_REQUESTED:  ['SUBMITTED'],
};

interface TransitionActor {
  triggeredBy: 'system' | 'ai' | 'reviewer' | 'citizen';
  actorId?: string;
  reason?: string;
}

export class StateMachineService {
  async transition(
    observationId: string,
    toState: ObsStatus,
    actor: TransitionActor
  ): Promise<void> {
    const result = await db.query(
      'SELECT id, status FROM observations WHERE id = $1',
      [observationId]
    );
    if (!result.rows.length) throw new Error(`Observation ${observationId} not found`);

    const { status: currentStatus } = result.rows[0];
    const allowed = TRANSITIONS[currentStatus as ObsStatus] ?? [];

    if (!allowed.includes(toState)) {
      throw new Error(
        `Invalid transition: ${currentStatus} → ${toState}. ` +
        `Allowed: [${allowed.join(', ')}]`
      );
    }

    await db.transaction(async (client) => {
      // Update observation status
      await client.query(
        'UPDATE observations SET status = $1::obs_status, updated_at = NOW() WHERE id = $2',
        [toState, observationId]
      );

      // Log transition
      await client.query(
        `INSERT INTO observation_state_transitions
          (observation_id, from_state, to_state, triggered_by, actor_id, reason)
         VALUES ($1, $2::obs_status, $3::obs_status, $4, $5, $6)`,
        [observationId, currentStatus, toState, actor.triggeredBy, actor.actorId ?? null, actor.reason ?? null]
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_logs (observation_id, action, actor_type, actor_id, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          observationId,
          `state_transition_${toState.toLowerCase()}`,
          actor.triggeredBy,
          actor.actorId ?? null,
          JSON.stringify({ fromState: currentStatus, toState, reason: actor.reason }),
        ]
      );
    });
  }

  canTransition(currentStatus: ObsStatus, toState: ObsStatus): boolean {
    return (TRANSITIONS[currentStatus] ?? []).includes(toState);
  }

  allowedTransitions(currentStatus: ObsStatus): ObsStatus[] {
    return TRANSITIONS[currentStatus] ?? [];
  }
}

export const stateMachine = new StateMachineService();
