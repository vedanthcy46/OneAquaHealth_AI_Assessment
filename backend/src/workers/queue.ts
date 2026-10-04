import { Queue } from 'bullmq';
import { env } from '../config/env';
import IORedis from 'ioredis';

const isTls = env.REDIS_URL.startsWith('rediss://') || env.REDIS_URL.includes('upstash.io');

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
});

export const aiQueue = new Queue('ai-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export { connection };
