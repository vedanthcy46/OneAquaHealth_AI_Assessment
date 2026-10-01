import 'dotenv/config';

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  PORT:          parseInt(optional('PORT', '3001')),
  NODE_ENV:      optional('NODE_ENV', 'development'),
  LOG_LEVEL:     optional('LOG_LEVEL', 'info'),

  DATABASE_URL:  required('DATABASE_URL'),
  REDIS_URL:     required('REDIS_URL'),

  JWT_SECRET:    required('JWT_SECRET'),
  JWT_EXPIRES_IN: optional('JWT_EXPIRES_IN', '7d'),

  S3_ENDPOINT:   optional('S3_ENDPOINT', ''),
  S3_BUCKET:     optional('S3_BUCKET', 'aquaguard-media'),
  S3_ACCESS_KEY: optional('S3_ACCESS_KEY', ''),
  S3_SECRET_KEY: optional('S3_SECRET_KEY', ''),
  S3_REGION:     optional('S3_REGION', 'auto'),

  AI_PROVIDER:   optional('AI_PROVIDER', 'gemini'),
  GEMINI_API_KEY:  optional('GEMINI_API_KEY', ''),
  OPENAI_API_KEY:  optional('OPENAI_API_KEY', ''),

  FRONTEND_URL:  optional('FRONTEND_URL', 'http://localhost:3000'),

  RATE_LIMIT_MAX:       parseInt(optional('RATE_LIMIT_MAX', '100')),
  RATE_LIMIT_WINDOW_MS: parseInt(optional('RATE_LIMIT_WINDOW_MS', '60000')),
};
