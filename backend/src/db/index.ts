import { Pool, PoolClient } from 'pg';
import { env } from '../config/env';

// Enable SSL automatically for cloud providers (Neon, Supabase, Railway, etc.)
const isCloudDb = env.DATABASE_URL.includes('neon.tech')
  || env.DATABASE_URL.includes('supabase.co')
  || env.DATABASE_URL.includes('sslmode=require');

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,                          // Neon free tier: max 10 connections per pool
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  ssl: isCloudDb ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export const db = {
  query: (text: string, params?: any[]) =>
    pool.query(text, params),

  getClient: () => pool.connect(),

  transaction: async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
};

export default pool;
