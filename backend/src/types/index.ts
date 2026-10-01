// ─── All shared TypeScript types for AquaGuard AI ───────────────────────────

export type UserRole = 'citizen' | 'reviewer' | 'admin';

export type ObsStatus =
  | 'DRAFT' | 'SUBMITTED' | 'AI_CHECK'
  | 'VALID' | 'REVIEW_REQUIRED' | 'HUMAN_REVIEW'
  | 'ACCEPTED' | 'CORRECTED' | 'REJECTED' | 'RESUBMIT_REQUESTED';

export type SyncStatus =
  | 'LOCAL' | 'QUEUED' | 'UPLOADING' | 'PROCESSING'
  | 'SYNCED' | 'CONFLICT' | 'FAILED';

export type MediaAnalysisStatus = 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';
export type ReviewDecision = 'ACCEPTED' | 'CORRECTED' | 'REJECTED' | 'RESUBMIT_REQUESTED';
export type AlertType = 'LOW_CONFIDENCE' | 'ANOMALY' | 'REPEATED_CHANGE' | 'DATA_QUALITY_ISSUE' | 'SUDDEN_CHANGE';
export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type RoutingDecision = 'VALID' | 'REVIEW_REQUIRED' | 'HUMAN_REVIEW';

export interface JWTPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: Date;
}

export interface Site {
  id: string;
  name: string;
  description: string | null;
  waterbody: string | null;
  city: string | null;
  country: string;
  metadata: Record<string, any>;
  created_by: string | null;
  is_active: boolean;
  created_at: Date;
  // PostGIS returns lat/lng separately after ST_AsGeoJSON
  lat?: number;
  lng?: number;
}

export interface Observation {
  id: string;
  local_id: string | null;
  site_id: string | null;
  observer_id: string | null;
  status: ObsStatus;
  sync_status: SyncStatus;
  gps_accuracy_m: number | null;
  observed_at: Date;
  env_observations: Record<string, any>;
  quality_score: number | null;
  version: number;
  submitted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  lat?: number;
  lng?: number;
}

export interface Media {
  id: string;
  observation_id: string;
  url: string;
  original_url: string | null;
  hash: string;
  phash: string | null;
  mime_type: string;
  file_size_bytes: number | null;
  quality_score: number | null;
  quality_factors: Record<string, any>;
  quality_suggestions: string[];
  analysis_status: MediaAnalysisStatus;
  is_duplicate: boolean;
  created_at: Date;
}

export interface AIResult {
  id: string;
  observation_id: string;
  model: string;
  model_version: string;
  prompt_version: string;
  input_hash: string | null;
  confidence: number | null;
  confidence_factors: ConfidenceFactors | null;
  explanation: Explanation | null;
  validation_warnings: ValidationWarning[];
  routing_decision: RoutingDecision | null;
  created_at: Date;
}

export interface ConfidenceFactors {
  imageQuality: number;
  aiEvidenceAgreement: number;
  citizenConsistency: number;
  gpsValidity: number;
  historicalConsistency: number;
}

export interface Explanation {
  what: string;
  why: string;
  evidence: string[];
  confidence: number;
  nextAction: string;
}

export interface ValidationWarning {
  type: 'CITIZEN_AI_CONFLICT' | 'DATA_QUALITY' | 'HISTORICAL_ANOMALY' | 'GPS_ISSUE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  citizenAnswer?: string;
  aiDetection?: string;
  confidence?: number;
  explanation: {
    what: string;
    why: string;
    nextAction: string;
  };
  resolved: boolean;
}

export interface AIEvidence {
  id: string;
  ai_result_id: string;
  indicator: string;
  present: 'true' | 'false' | 'uncertain';
  confidence: number;
  reasoning: string | null;
  source_media_id: string | null;
  image_region: { x: number; y: number; w: number; h: number } | null;
  model: string | null;
  model_version: string | null;
  created_at: Date;
}

export interface FollowupQuestion {
  id: string;
  ai_result_id: string;
  question_key: string;
  question_text: string;
  indicator_type: string | null;
  display_order: number;
  citizen_answer: string | null;
  answered_at: Date | null;
}

export interface HumanReview {
  id: string;
  observation_id: string;
  reviewer_id: string;
  decision: ReviewDecision;
  citizen_observation: Record<string, any> | null;
  ai_assessment: Record<string, any> | null;
  human_assessment: Record<string, any> | null;
  final_assessment: Record<string, any> | null;
  reason: string | null;
  reviewed_at: Date;
}

export interface AuditLog {
  id: string;
  observation_id: string | null;
  action: string;
  actor_type: 'ai' | 'citizen' | 'reviewer' | 'system';
  actor_id: string | null;
  model: string | null;
  model_version: string | null;
  prompt_version: string | null;
  confidence: number | null;
  created_at: Date;
}

// ─── API Response shapes ──────────────────────────────────────────────────────
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, any>;
}

export interface ApiError {
  success: false;
  error: string;
  code: string;
  details?: any;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
