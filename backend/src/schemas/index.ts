import { z } from 'zod';

// ─── Auth ────────────────────────────────────────────────────────────────────
export const RegisterSchema = z.object({
  email:       z.string().email(),
  password:    z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(2).max(80).optional(),
});

export const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

// ─── Sites ───────────────────────────────────────────────────────────────────
export const CreateSiteSchema = z.object({
  name:        z.string().min(2).max(200),
  description: z.string().max(1000).optional(),
  lat:         z.number().min(-90).max(90),
  lng:         z.number().min(-180).max(180),
  waterbody:   z.string().max(200).optional(),
  city:        z.string().max(100).optional(),
  country:     z.string().max(2).default('IE'),
  metadata:    z.record(z.unknown()).optional(),
});

export const UpdateSiteSchema = CreateSiteSchema.partial();

export const SiteQuerySchema = z.object({
  bbox:  z.string().optional(), // "lng1,lat1,lng2,lat2"
  city:  z.string().optional(),
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Observations ─────────────────────────────────────────────────────────────
export const CreateObservationSchema = z.object({
  siteId:     z.string().uuid(),
  localId:    z.string().optional(),
  gps:        z.object({
    lat:      z.number().min(-90).max(90),
    lng:      z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(10000),
  }),
  observedAt: z.string().datetime(),
  envObservations: z.object({
    waterClarity: z.enum(['clear','slightly_cloudy','cloudy','very_cloudy']).optional(),
    odour:        z.enum(['none','earthy','chemical','sewage','other']).optional(),
    debris:       z.enum(['none','some','heavy']).optional(),
    flowRate:     z.enum(['stagnant','slow','moderate','fast','very_fast']).optional(),
    channelType:  z.enum(['natural','concrete','mixed']).optional(),
    vegetation:   z.enum(['none','sparse','moderate','dense']).optional(),
  }).optional(),
});

export const UpdateObservationSchema = z.object({
  envObservations: CreateObservationSchema.shape.envObservations,
});

export const ObservationQuerySchema = z.object({
  siteId:  z.string().uuid().optional(),
  status:  z.string().optional(),
  page:    z.coerce.number().int().min(1).default(1),
  limit:   z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Follow-up Questions ─────────────────────────────────────────────────────
export const AnswerQuestionSchema = z.object({
  answer: z.string().min(1).max(500),
});

// ─── Human Review ────────────────────────────────────────────────────────────
export const ReviewSchema = z.object({
  decision: z.enum(['ACCEPTED', 'CORRECTED', 'REJECTED', 'RESUBMIT_REQUESTED']),
  corrections: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().min(1).max(2000),
});

export const ReviewQueueQuerySchema = z.object({
  minConfidence: z.coerce.number().int().min(0).max(100).optional(),
  maxConfidence: z.coerce.number().int().min(0).max(100).optional(),
  siteId:        z.string().uuid().optional(),
  page:          z.coerce.number().int().min(1).default(1),
  limit:         z.coerce.number().int().min(1).max(50).default(20),
});

// ─── Validation Warning resolution ───────────────────────────────────────────
export const ResolveWarningSchema = z.object({
  warningIndex: z.number().int().min(0),
  resolution:   z.enum(['acknowledged', 'corrected', 'note_added']),
  note:         z.string().max(500).optional(),
});

export type RegisterInput      = z.infer<typeof RegisterSchema>;
export type LoginInput         = z.infer<typeof LoginSchema>;
export type CreateSiteInput    = z.infer<typeof CreateSiteSchema>;
export type UpdateSiteInput    = z.infer<typeof UpdateSiteSchema>;
export type CreateObsInput     = z.infer<typeof CreateObservationSchema>;
export type UpdateObsInput     = z.infer<typeof UpdateObservationSchema>;
export type ReviewInput        = z.infer<typeof ReviewSchema>;
