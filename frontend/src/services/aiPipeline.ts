import type {
  EnvObservations,
  ImageQualityResult,
  AIEvidenceItem,
  ValidationWarning,
  ConfidenceFactors,
  AIResult,
  FollowupQuestion,
  Site,
} from '../types';
import { QUESTION_BANK } from '../data/mockData';

// Layer A: Real-time Image Quality Assessment Simulation
export function evaluateImageQuality(
  imageType: 'good' | 'blurry' | 'dark' | 'irrelevant' = 'good'
): ImageQualityResult {
  if (imageType === 'blurry') {
    return {
      qualityScore: 28,
      passed: false,
      routing: 'poor',
      factors: {
        blurScore: 22,
        blurPassed: false,
        brightnessScore: 78,
        brightnessPassed: true,
        occlusionScore: 65,
        occlusionPassed: true,
        streamRelevanceScore: 70,
        streamRelevancePassed: true,
        isDuplicate: false,
        duplicateSimilarity: 0.05,
      },
      feedback: [
        'High motion blur detected (Laplacian variance: 22.4, threshold: 60)',
        'Water surface texture is out of focus',
      ],
      suggestions: [
        'Hold phone steady with both hands or rest against a solid railing',
        'Tap the stream surface on your screen to focus before capturing',
        'Ensure the camera lens is clean and free of water droplets',
      ],
    };
  }

  if (imageType === 'dark') {
    return {
      qualityScore: 34,
      passed: false,
      routing: 'poor',
      factors: {
        blurScore: 70,
        blurPassed: true,
        brightnessScore: 25,
        brightnessPassed: false,
        occlusionScore: 80,
        occlusionPassed: true,
        streamRelevanceScore: 68,
        streamRelevancePassed: true,
        isDuplicate: false,
        duplicateSimilarity: 0.04,
      },
      feedback: ['Insufficient ambient lighting (mean luminance: 28/255)'],
      suggestions: [
        'Move out from dense tree shadow or change angle to catch natural daylight',
        'Ensure sun is behind you when photographing the water surface',
      ],
    };
  }

  // Good quality photo
  return {
    qualityScore: 86,
    passed: true,
    routing: 'good',
    factors: {
      blurScore: 88,
      blurPassed: true,
      brightnessScore: 84,
      brightnessPassed: true,
      occlusionScore: 89,
      occlusionPassed: true,
      streamRelevanceScore: 86,
      streamRelevancePassed: true,
      isDuplicate: false,
      duplicateSimilarity: 0.08,
    },
    feedback: [
      'Sharp edge contrast and clear water surface reflections',
      'Good balanced exposure and natural sunlight',
      'Stream channel and riparian corridor clearly framed',
    ],
    suggestions: ['Ready for ecological evidence detection'],
  };
}

// Layer B: Ecological Evidence Detection
export function detectEcologicalEvidence(
  envObs: EnvObservations,
  isTurbidScenario = true
): AIEvidenceItem[] {
  const items: AIEvidenceItem[] = [];

  if (isTurbidScenario) {
    items.push({
      id: `ev-${Date.now()}-1`,
      indicator: 'turbidity',
      present: true,
      confidence: 0.94,
      severity: 'moderate',
      value: 'murky',
      reasoning: 'Elevated optical scattering, streambed obscured at shallow depths with suspended brown clay particulates.',
      imageRegion: { x: 0.35, y: 0.48, w: 0.35, h: 0.30, label: 'Suspended Silt' },
    });
    items.push({
      id: `ev-${Date.now()}-2`,
      indicator: 'floating_debris',
      present: true,
      confidence: 0.72,
      severity: 'low',
      value: 'synthetic_packaging',
      reasoning: 'Isolated plastic container detected drifting along stream margin.',
      imageRegion: { x: 0.52, y: 0.65, w: 0.08, h: 0.05, label: 'Plastic Bottle' },
    });
  } else {
    items.push({
      id: `ev-${Date.now()}-1`,
      indicator: 'turbidity',
      present: false,
      confidence: 0.91,
      value: 'clear',
      reasoning: 'Streambed cobbles and gravel clearly discernible with high transparency.',
      imageRegion: { x: 0.35, y: 0.48, w: 0.35, h: 0.30, label: 'Clear Bed' },
    });
  }

  items.push({
    id: `ev-${Date.now()}-3`,
    indicator: 'riparian_vegetation',
    present: true,
    confidence: 0.94,
    severity: 'low',
    value: 'dense',
    reasoning: 'Healthy continuous overhanging native eucalyptus canopy along left embankment.',
    imageRegion: { x: 0.05, y: 0.25, w: 0.30, h: 0.45, label: 'Riparian Buffer' },
  });

  items.push({
    id: `ev-${Date.now()}-4`,
    indicator: 'flow_condition',
    present: true,
    confidence: 0.86,
    value: envObs.flowRate || 'moderate',
    reasoning: 'Surface movement and ripple vectors indicate steady active stream flow.',
  });

  return items;
}

// Layer C: Adaptive Question Selection (Picks 3-4 targeted questions from the 25-question bank)
export function selectAdaptiveQuestions(evidence: AIEvidenceItem[]): FollowupQuestion[] {
  const selected: FollowupQuestion[] = [];
  const indicatorsDetected = new Set(evidence.filter((e) => e.present).map((e) => e.indicator));

  if (indicatorsDetected.has('turbidity')) {
    const q1 = QUESTION_BANK.find((q) => q.id === 'q-turbidity-depth');
    if (q1) selected.push({ ...q1, aiSuggestedAnswer: 'obscured' });
    const q2 = QUESTION_BANK.find((q) => q.id === 'q-turbidity-rain');
    if (q2) selected.push(q2);
  }

  if (indicatorsDetected.has('floating_debris')) {
    const q = QUESTION_BANK.find((q) => q.id === 'q-debris-type');
    if (q) selected.push({ ...q, aiSuggestedAnswer: 'macroplastics' });
  }

  if (indicatorsDetected.has('algal_bloom')) {
    const q = QUESTION_BANK.find((q) => q.id === 'q-algae-type');
    if (q) selected.push(q);
  }

  if (selected.length < 3) {
    const bufferQ = QUESTION_BANK.find((q) => q.id === 'q-buffer-width');
    if (bufferQ && !selected.some((s) => s.id === bufferQ.id)) {
      selected.push({ ...bufferQ, aiSuggestedAnswer: 'wide_buffer' });
    }
  }

  if (selected.length < 4) {
    const odourQ = QUESTION_BANK.find((q) => q.id === 'q-water-odour');
    if (odourQ && !selected.some((s) => s.id === odourQ.id)) {
      selected.push(odourQ);
    }
  }

  return selected.slice(0, 4);
}

// Layer D: Cross-Validation Rules & Conflict Engine
export function validateObservation(
  envObs: EnvObservations,
  evidence: AIEvidenceItem[],
  site: Site,
  gpsAccuracyM: number
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // Rule 1: Citizen vs AI Turbidity / Clarity Conflict
  const turbidEvidence = evidence.find((e) => e.indicator === 'turbidity');
  if (
    turbidEvidence &&
    turbidEvidence.present &&
    turbidEvidence.confidence > 0.75 &&
    (envObs.waterClarity === 'clear' || envObs.waterClarity === 'crystal_clear')
  ) {
    warnings.push({
      id: `conflict-turbidity-${Date.now()}`,
      type: 'CITIZEN_AI_CONFLICT',
      severity: 'HIGH',
      citizenAnswer: `Water clarity selected: "${envObs.waterClarity.replace('_', ' ')}"`,
      aiDetection: `AI Vision detected turbidity (${Math.round(turbidEvidence.confidence * 100)}% confidence)`,
      confidence: turbidEvidence.confidence,
      explanation: {
        what: 'Possible inconsistency detected in water clarity',
        why: `You selected "${envObs.waterClarity.replace('_', ' ')}", but optical analysis detected reduced clarity with ${Math.round(turbidEvidence.confidence * 100)}% confidence due to suspended sediments.`,
        nextAction: 'Please double-check whether the streambed is truly visible or update your response to "slightly cloudy" or "murky".',
      },
      resolved: false,
    });
  }

  // Rule 2: Historical Anomaly Check (Z-Score)
  const estimatedClarityScore =
    envObs.waterClarity === 'crystal_clear'
      ? 95
      : envObs.waterClarity === 'clear'
      ? 85
      : envObs.waterClarity === 'slightly_cloudy'
      ? 65
      : envObs.waterClarity === 'murky'
      ? 40
      : 20;

  const zScore = Math.abs(
    (estimatedClarityScore - site.baseline.clarityScoreAvg) / site.baseline.clarityScoreStd
  );

  if (zScore > 2.0) {
    warnings.push({
      id: `anomaly-baseline-${Date.now()}`,
      type: 'HISTORICAL_ANOMALY',
      severity: 'MEDIUM',
      citizenAnswer: `Observed clarity score ~${estimatedClarityScore}`,
      aiDetection: `Historical baseline is ${site.baseline.clarityScoreAvg} ± ${site.baseline.clarityScoreStd} (Z-Score: ${zScore.toFixed(2)})`,
      confidence: 0.85,
      explanation: {
        what: 'Significant departure from historical stream baseline',
        why: `The average clarity at ${site.name} is ${site.baseline.clarityScoreAvg}/100. This observation deviates by ${zScore.toFixed(1)} standard deviations.`,
        nextAction: 'Flagged for human reviewer inspection to verify if an environmental incident or runoff event occurred.',
      },
      resolved: false,
    });
  }

  // Rule 3: Low GPS Accuracy
  if (gpsAccuracyM > 50) {
    warnings.push({
      id: `warn-gps-${Date.now()}`,
      type: 'GPS_ISSUE',
      severity: 'MEDIUM',
      citizenAnswer: `Accuracy: ±${Math.round(gpsAccuracyM)}m`,
      aiDetection: 'Satellite trilateration imprecise',
      confidence: 0.9,
      explanation: {
        what: 'GPS location accuracy is low (> 50m)',
        why: 'Weak mobile satellite reception may position this observation away from the exact stream corridor.',
        nextAction: 'Please step out into an open viewing point for better satellite lock.',
      },
      resolved: false,
    });
  }

  return warnings;
}

// 5-Factor Weighted Confidence Calculation
export function calculateConfidence(
  imageQualityScore: number,
  evidence: AIEvidenceItem[],
  warnings: ValidationWarning[],
  gpsAccuracyM: number,
  isHistoricalAnomaly: boolean
): {
  score: number;
  factors: ConfidenceFactors;
  routing: 'VALID' | 'REVIEW_REQUIRED' | 'HUMAN_REVIEW';
} {
  const imageQuality = imageQualityScore;

  // AI Evidence Agreement: average confidence of detections
  const aiEvidenceAgreement = evidence.length > 0
    ? Math.round(
        (evidence.reduce((acc, curr) => acc + curr.confidence, 0) / evidence.length) * 100
      )
    : 80;

  // Citizen Consistency: deduct 15 points per unresolved warning
  const unresolvedConflicts = warnings.filter((w) => !w.resolved && w.type === 'CITIZEN_AI_CONFLICT').length;
  const citizenConsistency = Math.max(20, 100 - unresolvedConflicts * 25);

  // GPS Validity
  const gpsValidity = gpsAccuracyM < 10 ? 100 : gpsAccuracyM < 30 ? 85 : gpsAccuracyM < 50 ? 65 : 30;

  // Historical Consistency
  const historicalConsistency = isHistoricalAnomaly ? 55 : 95;

  const score = Math.round(
    imageQuality * 0.25 +
    aiEvidenceAgreement * 0.30 +
    citizenConsistency * 0.25 +
    gpsValidity * 0.10 +
    historicalConsistency * 0.10
  );

  const routing =
    score >= 80 ? 'VALID' :
    score >= 60 ? 'REVIEW_REQUIRED' :
    'HUMAN_REVIEW';

  return {
    score,
    factors: {
      imageQuality,
      aiEvidenceAgreement,
      citizenConsistency,
      gpsValidity,
      historicalConsistency,
    },
    routing,
  };
}

// End-to-end Pipeline Execution
export function runAIPipeline(
  observationId: string,
  imageQualityResult: ImageQualityResult,
  envObs: EnvObservations,
  site: Site,
  gpsAccuracyM = 4.2
): AIResult {
  const evidence = detectEcologicalEvidence(envObs, true);
  const warnings = validateObservation(envObs, evidence, site, gpsAccuracyM);
  const isHistoricalAnomaly = warnings.some((w) => w.type === 'HISTORICAL_ANOMALY');

  const { score, factors, routing } = calculateConfidence(
    imageQualityResult.qualityScore,
    evidence,
    warnings,
    gpsAccuracyM,
    isHistoricalAnomaly
  );

  return {
    id: `ai-res-${Date.now()}`,
    observationId,
    model: 'gemini-1.5-pro-vision',
    modelVersion: '2026-v2',
    promptVersion: 'layer_b_evidence_v2.1',
    inputHash: `sha256-${Math.random().toString(36).substring(2, 10)}`,
    confidence: score,
    confidenceFactors: factors,
    explanation: {
      what: 'Water turbidity and isolated plastic debris detected',
      why: 'Reduced streambed visibility and elevated brown pixel distribution indicate turbidity despite citizen reporting clear water.',
      evidence: evidence.map((e) => `${e.indicator}: ${e.value} (${Math.round(e.confidence * 100)}% confidence)`),
      confidence: score,
      nextAction: routing === 'VALID'
        ? 'Auto-accepted into validated stream dataset.'
        : routing === 'REVIEW_REQUIRED'
        ? 'Flagged for human reviewer queue due to citizen-AI consistency warning.'
        : 'Mandatory expert reviewer triage required.',
    },
    evidence,
    validationWarnings: warnings,
    routingDecision: routing,
    createdAt: new Date().toISOString(),
  };
}
