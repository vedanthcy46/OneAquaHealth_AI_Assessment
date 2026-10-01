import { Queue } from 'bullmq';
import { env } from '../config/env';
import IORedis from 'ioredis';

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

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
