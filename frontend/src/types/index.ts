// AquaGuard AI - Shared Types & Contracts
// Conforms to TEAM_TASK_SPLIT.md Section 4 & AQUAGUARD_BUILD_PLAN.md

export type ObsStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'AI_CHECK'
  | 'VALID'
  | 'REVIEW_REQUIRED'
  | 'HUMAN_REVIEW'
  | 'ACCEPTED'
  | 'CORRECTED'
  | 'REJECTED'
  | 'RESUBMIT_REQUESTED';

export type SyncStatus =
  | 'LOCAL'
  | 'QUEUED'
  | 'UPLOADING'
  | 'PROCESSING'
  | 'SYNCED'
  | 'CONFLICT'
  | 'FAILED';

export type UserRole = 'citizen' | 'reviewer' | 'admin';

export type ReviewDecision = 'ACCEPTED' | 'CORRECTED' | 'REJECTED' | 'RESUBMIT_REQUESTED';

export type AlertType = 'LOW_CONFIDENCE' | 'ANOMALY' | 'REPEATED_CHANGE' | 'DATA_QUALITY_ISSUE' | 'SUDDEN_CHANGE';

export type BioHealthRisk = 'Low' | 'Moderate' | 'High' | 'Very high' | 'No data';

export interface WaterHealthRecord {
  date: string;
  fishQuality?: 'Poor' | 'Moderate' | 'Good' | 'High';
  fishRichness?: number;
  macroinvertebrateQuality?: 'Poor' | 'Moderate' | 'Good' | 'High';
  macroinvertebrateRichness?: number;
  diatomQuality?: 'Poor' | 'Moderate' | 'Good' | 'High';
  diatomRichness?: number;
  nitrate?: number; // mg/L
  waterHealthRisk: BioHealthRisk;
}

export interface SubSite {
  code: string;        // e.g. "T3"
  name: string;        // e.g. "Ruisseau de Bonneval amont"
  coordinates: { lat: number; lng: number };
  healthRisk: BioHealthRisk;
  lastRecord?: WaterHealthRecord;
}

export interface Site {
  id: string;
  name: string;
  description: string;
  waterbody: string;
  city: string;
  country: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  subSites: SubSite[];  // individual monitoring points within the city
  baseline: {
    clarityScoreAvg: number; // 0-100 (100 = crystal clear)
    clarityScoreStd: number;
    debrisFrequency: string; // 'rare' | 'occasional' | 'frequent'
    typicalFlow: string;
  };
  recentObservationsCount: number;
  activeAnomaliesCount: number;
}

export interface EnvObservations {
  waterClarity: 'crystal_clear' | 'clear' | 'slightly_cloudy' | 'murky' | 'opaque';
  odour: 'none' | 'earthy' | 'sewage' | 'chemical' | 'fishy';
  debris: 'none' | 'natural_only' | 'plastic_litter' | 'heavy_dumping';
  flowRate: 'stagnant' | 'slow' | 'moderate' | 'rapid' | 'torrential';
  channelType: 'natural_earthen' | 'vegetated_banks' | 'partially_engineered' | 'concrete_channel';
  notes?: string;
  waterClarityScore?: number; // 0 - 100 numeric representation
}

export interface ImageQualityFactors {
  blurScore: number; // 0-100 (higher = sharper)
  blurPassed: boolean;
  brightnessScore: number; // 0-100 (higher = well exposed)
  brightnessPassed: boolean;
  occlusionScore: number; // 0-100 (higher = unobstructed)
  occlusionPassed: boolean;
  streamRelevanceScore: number; // 0-100 (higher = clearly shows waterbody)
  streamRelevancePassed: boolean;
  isDuplicate: boolean;
  duplicateSimilarity: number;
}

export interface ImageQualityResult {
  qualityScore: number; // 0-100 overall
  passed: boolean;
  routing: 'good' | 'marginal' | 'poor';
  factors: ImageQualityFactors;
  feedback: string[];
  suggestions: string[];
}

export interface ImageRegion {
  x: number; // 0-1
  y: number; // 0-1
  w: number; // 0-1
  h: number; // 0-1
  label?: string;
}

export interface AIEvidenceItem {
  id: string;
  indicator:
    | 'turbidity'
    | 'floating_debris'
    | 'algal_bloom'
    | 'riparian_vegetation'
    | 'concrete_channel'
    | 'flow_condition'
    | 'foam_sheen'
    | 'water_color'
    | 'erosion'
    | 'wildlife';
  present: boolean;
  confidence: number; // 0.0 - 1.0
  severity?: 'low' | 'moderate' | 'high';
  value: string; // e.g. "murky", "present", "dense", "flowing"
  reasoning: string;
  imageRegion?: ImageRegion;
  sourceMediaId?: string;
}

export interface ValidationExplanation {
  what: string;
  why: string;
  nextAction: string;
}

export interface ValidationWarning {
  id: string;
  type: 'CITIZEN_AI_CONFLICT' | 'DATA_QUALITY' | 'HISTORICAL_ANOMALY' | 'GPS_ISSUE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  citizenAnswer?: string;
  aiDetection?: string;
  confidence?: number;
  explanation: ValidationExplanation;
  resolved: boolean;
}

export interface ConfidenceFactors {
  imageQuality: number; // weight 25%
  aiEvidenceAgreement: number; // weight 30%
  citizenConsistency: number; // weight 25%
  gpsValidity: number; // weight 10%
  historicalConsistency: number; // weight 10%
}

export interface AIResult {
  id: string;
  observationId: string;
  model: string;
  modelVersion: string;
  promptVersion: string;
  inputHash: string;
  confidence: number; // 0 - 100
  confidenceFactors: ConfidenceFactors;
  explanation: {
    what: string;
    why: string;
    evidence: string[];
    confidence: number;
    nextAction: string;
  };
  evidence: AIEvidenceItem[];
  validationWarnings: ValidationWarning[];
  routingDecision: 'VALID' | 'REVIEW_REQUIRED' | 'HUMAN_REVIEW';
  createdAt: string;
}

export interface FollowupQuestion {
  id: string;
  questionKey: string;
  questionText: string;
  indicatorType: string;
  options: { label: string; value: string }[];
  citizenAnswer?: string;
  aiSuggestedAnswer?: string;
  answeredAt?: string;
}

export interface HumanReview {
  id: string;
  observationId: string;
  reviewerId: string;
  decision: ReviewDecision;
  citizenObservation: EnvObservations;
  aiAssessment: Record<string, any>;
  humanAssessment?: Partial<EnvObservations>;
  finalAssessment: EnvObservations;
  reason: string;
  createdAt: string;
}

export interface MediaItem {
  id: string;
  observationId: string;
  url: string;
  originalUrl?: string;
  hash: string;
  phash?: string;
  mimeType: string;
  fileSizeBytes: number;
  captureTimestamp: string;
  gps?: { lat: number; lng: number; accuracy: number };
  qualityScore: number;
  qualityFactors: ImageQualityFactors;
}

export interface Observation {
  id: string;
  localId?: string;
  siteId: string;
  siteName: string;
  observerId: string;
  observerName?: string;
  status: ObsStatus;
  syncStatus: SyncStatus;
  gps: {
    lat: number;
    lng: number;
    accuracy: number;
  };
  observedAt: string;
  envObservations: EnvObservations;
  qualityScore: number;
  version: number;
  media: MediaItem[];
  aiResult?: AIResult;
  followupQuestions: FollowupQuestion[];
  humanReview?: HumanReview;
  historyTimeline?: {
    date: string;
    clarity: string;
    status: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface SiteHealthTimelinePoint {
  week: string; // "2026-W36"
  dateLabel: string;
  observationCount: number;
  avgQuality: number;
  avgClarity: number; // 0-100
  debrisReportsCount: number;
  algaeDetectedCount: number;
  isAnomaly: boolean;
  zScore: number;
}
