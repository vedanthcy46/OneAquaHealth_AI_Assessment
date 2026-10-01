import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import pool from './index';

async function seed() {
  const client = await pool.connect();
  try {
    console.log('🌱 Seeding database...');
    await client.query('BEGIN');

    // ── Users ──────────────────────────────────────────────────────────────
    const adminId    = uuidv4();
    const reviewer1  = uuidv4();
    const citizen1   = uuidv4();
    const citizen2   = uuidv4();

    const pw = await bcrypt.hash('Password123!', 10);
    await client.query(`
      INSERT INTO users (id, email, password_hash, display_name, role) VALUES
        ($1, 'admin@aquaguard.ai',    $5, 'Admin User',    'admin'),
        ($2, 'reviewer@aquaguard.ai', $5, 'Jane Reviewer', 'reviewer'),
        ($3, 'alice@example.com',     $5, 'Alice Citizen',  'citizen'),
        ($4, 'bob@example.com',       $5, 'Bob Citizen',    'citizen')
      ON CONFLICT (email) DO NOTHING
    `, [adminId, reviewer1, citizen1, citizen2, pw]);

    // ── Sites ──────────────────────────────────────────────────────────────
    const site1 = uuidv4();
    const site2 = uuidv4();
    const site3 = uuidv4();

    await client.query(`
      INSERT INTO sites (id, name, description, lat, lng, waterbody, city, country, created_by) VALUES
        ($1, 'Merri Creek — Clifton Hill',
             'Urban creek section near Clifton Hill with moderate flow',
             -37.7900, 144.9962, 'Merri Creek', 'Melbourne', 'AU', $4),
        ($2, 'Liffey River — City Centre',
             'Main river channel through Dublin city centre',
             53.3441, -6.2603, 'River Liffey', 'Dublin', 'IE', $4),
        ($3, 'Tagus River — Lisbon',
             'Estuary monitoring point near Lisbon',
             38.7223, -9.1393, 'River Tagus', 'Lisbon', 'PT', $4)
      ON CONFLICT DO NOTHING
    `, [site1, site2, site3, adminId]);

    // ── Observations ───────────────────────────────────────────────────────
    const observations = [
      { id: uuidv4(), siteId: site1, obsId: citizen1, status: 'ACCEPTED',          clarity: 'clear',           score: 88, daysAgo: 30 },
      { id: uuidv4(), siteId: site1, obsId: citizen1, status: 'ACCEPTED',          clarity: 'clear',           score: 85, daysAgo: 22 },
      { id: uuidv4(), siteId: site1, obsId: citizen2, status: 'CORRECTED',         clarity: 'slightly_cloudy', score: 76, daysAgo: 15 },
      { id: uuidv4(), siteId: site1, obsId: citizen1, status: 'REVIEW_REQUIRED',   clarity: 'clear',           score: 61, daysAgo: 7  },
      { id: uuidv4(), siteId: site1, obsId: citizen2, status: 'HUMAN_REVIEW',      clarity: 'clear',           score: 48, daysAgo: 3  },
      { id: uuidv4(), siteId: site2, obsId: citizen1, status: 'VALID',             clarity: 'slightly_cloudy', score: 82, daysAgo: 10 },
      { id: uuidv4(), siteId: site2, obsId: citizen2, status: 'SUBMITTED',         clarity: 'cloudy',          score: 70, daysAgo: 1  },
      { id: uuidv4(), siteId: site3, obsId: citizen1, status: 'DRAFT',             clarity: 'clear',           score: 0,  daysAgo: 0  },
    ];

    for (const o of observations) {
      await client.query(`
        INSERT INTO observations
          (id, site_id, observer_id, status, lat, lng, gps_accuracy_m,
           observed_at, env_observations, quality_score, submitted_at)
        VALUES
          ($1, $2, $3, $4::obs_status,
           -37.7900, 144.9962, 5.0,
           NOW() - ($5 || ' days')::interval,
           $6, $7,
           NOW() - ($5 || ' days')::interval)
        ON CONFLICT DO NOTHING
      `, [
        o.id, o.siteId, o.obsId, o.status,
        o.daysAgo,
        JSON.stringify({
          waterClarity: o.clarity,
          odour: 'none',
          debris: 'none',
          flowRate: 'moderate',
        }),
        o.score || null,
      ]);
    }

    await client.query('COMMIT');
    console.log('✅ Seed complete: 4 users, 3 sites, 8 observations');
    console.log('\n🔑 Login credentials:');
    console.log('   admin@aquaguard.ai     / Password123!  (admin)');
    console.log('   reviewer@aquaguard.ai  / Password123!  (reviewer)');
    console.log('   alice@example.com      / Password123!  (citizen)');
    console.log('   bob@example.com        / Password123!  (citizen)');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
