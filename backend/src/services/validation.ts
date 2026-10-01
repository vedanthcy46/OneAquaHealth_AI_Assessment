import { db } from '../db';
import { ValidationWarning } from '../types';

interface ValidationInput {
  observationId: string;
  citizenAnswers: Record<string, any>;
  evidence: Array<{ indicator: string; confidence: number; present: string }>;
  gpsAccuracyM: number | null;
  mediaQualityScore: number | null;
}

export class ValidationService {
  async validate(input: ValidationInput): Promise<{
    warnings: ValidationWarning[];
    overallValid: boolean;
    requiresReview: boolean;
  }> {
    const warnings: ValidationWarning[] = [];

    // Rule 1: Turbidity vs "clear" water
    const turbidity = input.evidence.find(e => e.indicator === 'turbidity');
    if (
      turbidity?.present === 'true' &&
      turbidity.confidence > 0.70 &&
      input.citizenAnswers.waterClarity === 'clear'
    ) {
      warnings.push({
        type: 'CITIZEN_AI_CONFLICT',
        severity: 'HIGH',
        citizenAnswer: 'clear',
        aiDetection: 'turbidity',
        confidence: turbidity.confidence,
        explanation: {
          what: 'Your water clarity answer may not match the image',
          why: `Image analysis detected turbidity with ${Math.round(turbidity.confidence * 100)}% confidence, but you selected "clear water"`,
          nextAction: 'Please review and update your water clarity response',
        },
        resolved: false,
      });
    }

    // Rule 2: Debris vs "none"
    const debris = input.evidence.find(e => e.indicator === 'floating_debris');
    if (
      debris?.present === 'true' &&
      debris.confidence > 0.80 &&
      input.citizenAnswers.debris === 'none'
    ) {
      warnings.push({
        type: 'CITIZEN_AI_CONFLICT',
        severity: 'HIGH',
        citizenAnswer: 'none',
        aiDetection: 'floating_debris',
        confidence: debris.confidence,
        explanation: {
          what: 'Possible debris detected in the image',
          why: `The image suggests floating material with ${Math.round(debris.confidence * 100)}% confidence, but you selected "no debris"`,
          nextAction: 'Please check the image and update your debris response if needed',
        },
        resolved: false,
      });
    }

    // Rule 3: Algae bloom vs no mention
    const algae = input.evidence.find(e => e.indicator === 'algae_bloom');
    if (algae?.present === 'true' && algae.confidence > 0.75) {
      warnings.push({
        type: 'CITIZEN_AI_CONFLICT',
        severity: 'MEDIUM',
        aiDetection: 'algae_bloom',
        confidence: algae.confidence,
        explanation: {
          what: 'Possible algae growth detected',
          why: `Surface algae coverage detected with ${Math.round(algae.confidence * 100)}% confidence`,
          nextAction: 'Please note if you observed any green or blue-green surface coverage',
        },
        resolved: false,
      });
    }

    // Rule 4: Poor GPS accuracy
    if (input.gpsAccuracyM !== null && input.gpsAccuracyM > 50) {
      warnings.push({
        type: 'GPS_ISSUE',
        severity: 'MEDIUM',
        explanation: {
          what: 'GPS accuracy is low',
          why: `Location accuracy is ${Math.round(input.gpsAccuracyM)}m, which reduces observation reliability`,
          nextAction: 'Move to an open area for a better GPS fix, or verify location manually',
        },
        resolved: false,
      });
    }

    // Rule 5: Poor image quality
    if (input.mediaQualityScore !== null && input.mediaQualityScore < 40) {
      warnings.push({
        type: 'DATA_QUALITY',
        severity: 'HIGH',
        explanation: {
          what: 'Image quality is insufficient',
          why: `Image quality score is ${input.mediaQualityScore}/100 — too low for reliable analysis`,
          nextAction: 'Please retake the photo in better conditions',
        },
        resolved: false,
      });
    }

    // Rule 6: Historical anomaly check
    const historicalWarning = await this.checkHistoricalAnomaly(
      input.observationId,
      input.citizenAnswers
    );
    if (historicalWarning) warnings.push(historicalWarning);

    const hasHighSeverity = warnings.some(w => w.severity === 'HIGH' && !w.resolved);
    const overallValid = !hasHighSeverity;
    const requiresReview = warnings.length > 0;

    return { warnings, overallValid, requiresReview };
  }

  private async checkHistoricalAnomaly(
    observationId: string,
    citizenAnswers: Record<string, any>
  ): Promise<ValidationWarning | null> {
    try {
      const obsResult = await db.query(
        'SELECT site_id FROM observations WHERE id = $1',
        [observationId]
      );
      if (!obsResult.rows.length || !obsResult.rows[0].site_id) return null;

      const { site_id } = obsResult.rows[0];
      const histResult = await db.query(`
        SELECT env_observations
        FROM observations
        WHERE site_id = $1
          AND id != $2
          AND status IN ('ACCEPTED','CORRECTED')
        ORDER BY observed_at DESC
        LIMIT 10
      `, [site_id, observationId]);

      if (histResult.rows.length < 3) return null;

      const historicalClarity = histResult.rows
        .map(r => r.env_observations?.waterClarity)
        .filter(Boolean);

      const clearCount = historicalClarity.filter(c => c === 'clear').length;
      const clearPercent = clearCount / historicalClarity.length;

      if (clearPercent > 0.8 && citizenAnswers.waterClarity &&
          ['cloudy', 'very_cloudy'].includes(citizenAnswers.waterClarity)) {
        return {
          type: 'HISTORICAL_ANOMALY',
          severity: 'MEDIUM',
          citizenAnswer: citizenAnswers.waterClarity,
          explanation: {
            what: 'Observation differs significantly from site history',
            why: `${Math.round(clearPercent * 100)}% of recent observations at this site reported clear water`,
            nextAction: 'Please verify this observation — it may represent a genuine change or a data entry error',
          },
          resolved: false,
        };
      }

      return null;
    } catch {
      return null;
    }
  }
}

export const validationService = new ValidationService();
