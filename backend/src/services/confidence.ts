import { db } from '../db';
import { ConfidenceFactors, RoutingDecision, ValidationWarning } from '../types';

interface ConfidenceInput {
  mediaQualityScore: number | null;
  evidence: Array<{ indicator: string; confidence: number; present: string }>;
  validationWarnings: ValidationWarning[];
  gpsAccuracyM: number | null;
  siteId: string;
}

interface ConfidenceResult {
  score: number;
  factors: ConfidenceFactors;
  routing: RoutingDecision;
  explanation: {
    what: string;
    why: string;
    evidence: string[];
    confidence: number;
    nextAction: string;
  };
}

export class ConfidenceService {
  async calculate(input: ConfidenceInput): Promise<ConfidenceResult> {
    // Factor 1: Image Quality (25%)
    const imageQuality = input.mediaQualityScore ?? 50;

    // Factor 2: AI Evidence Agreement (30%) — how self-consistent the detections are
    const aiEvidenceAgreement = this.calcEvidenceAgreement(input.evidence);

    // Factor 3: Citizen Consistency (25%) — penalise unresolved conflicts
    const unresolvedWarnings = input.validationWarnings.filter(w => !w.resolved).length;
    const citizenConsistency = Math.max(0, 100 - unresolvedWarnings * 20);

    // Factor 4: GPS Validity (10%)
    const gpsValidity = this.calcGpsScore(input.gpsAccuracyM);

    // Factor 5: Historical Consistency (10%)
    const historicalConsistency = await this.calcHistoricalScore(input.siteId, input.evidence);

    const score = Math.round(
      imageQuality        * 0.25 +
      aiEvidenceAgreement * 0.30 +
      citizenConsistency  * 0.25 +
      gpsValidity         * 0.10 +
      historicalConsistency * 0.10
    );

    const factors: ConfidenceFactors = {
      imageQuality,
      aiEvidenceAgreement,
      citizenConsistency,
      gpsValidity,
      historicalConsistency,
    };

    const routing: RoutingDecision =
      score >= 80 ? 'VALID' :
      score >= 60 ? 'REVIEW_REQUIRED' :
      'HUMAN_REVIEW';

    const explanation = this.buildExplanation(score, factors, routing, unresolvedWarnings, historicalConsistency);

    return { score, factors, routing, explanation };
  }

  private calcEvidenceAgreement(evidence: ConfidenceInput['evidence']): number {
    if (!evidence.length) return 50;
    const presentWithHighConf = evidence.filter(e => e.present === 'true' && e.confidence > 0.7);
    const avgConf = presentWithHighConf.length
      ? presentWithHighConf.reduce((sum, e) => sum + e.confidence, 0) / presentWithHighConf.length
      : 0.5;
    return Math.round(avgConf * 100);
  }

  private calcGpsScore(accuracyM: number | null): number {
    if (accuracyM === null) return 50;
    if (accuracyM <= 10) return 100;
    if (accuracyM <= 20) return 90;
    if (accuracyM <= 50) return 70;
    if (accuracyM <= 100) return 40;
    return 10;
  }

  private async calcHistoricalScore(
    siteId: string,
    evidence: ConfidenceInput['evidence']
  ): Promise<number> {
    try {
      const res = await db.query(`
        SELECT env_observations
        FROM observations
        WHERE site_id = $1
          AND status IN ('ACCEPTED', 'CORRECTED')
        ORDER BY observed_at DESC
        LIMIT 10
      `, [siteId]);

      if (res.rows.length < 3) return 70; // not enough history

      const historicalClarity = res.rows
        .map(r => r.env_observations?.waterClarity)
        .filter(Boolean);

      const hasHistoricalTurbidity = historicalClarity.some(c =>
        ['slightly_cloudy', 'cloudy', 'very_cloudy'].includes(c)
      );
      const currentTurbidity = evidence.find(e => e.indicator === 'turbidity' && e.present === 'true');

      // If historically clear but currently turbid — flag
      if (!hasHistoricalTurbidity && currentTurbidity && currentTurbidity.confidence > 0.7) {
        return 40;
      }
      return 90;
    } catch {
      return 70;
    }
  }

  private buildExplanation(
    score: number,
    factors: ConfidenceFactors,
    routing: RoutingDecision,
    unresolvedWarnings: number,
    historicalConsistency: number
  ) {
    const weakFactors: string[] = [];
    if (factors.imageQuality < 60) weakFactors.push('image quality is low');
    if (factors.citizenConsistency < 80) weakFactors.push(`${unresolvedWarnings} unresolved citizen-AI conflict(s)`);
    if (historicalConsistency < 60) weakFactors.push('observation differs from site history');

    const nextAction =
      routing === 'VALID' ? 'Observation accepted automatically.' :
      routing === 'REVIEW_REQUIRED' ? 'Observation queued for reviewer.' :
      'Mandatory expert review required.';

    return {
      what: `Assessment confidence: ${score}/100`,
      why: weakFactors.length
        ? `Confidence reduced because: ${weakFactors.join('; ')}.`
        : 'All factors within acceptable range.',
      evidence: Object.entries(factors).map(
        ([k, v]) => `${k}: ${v}/100`
      ),
      confidence: score,
      nextAction,
    };
  }
}

export const confidenceService = new ConfidenceService();
