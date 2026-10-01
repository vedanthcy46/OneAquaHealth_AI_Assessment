import { db } from '../db';

interface SiteBaseline {
  mean: number;
  std: number;
  sampleSize: number;
}

export class AnomalyService {
  async detectAnomaly(siteId: string, currentValue: number, indicator: string): Promise<{
    isAnomaly: boolean;
    zScore: number;
    baseline: SiteBaseline;
  }> {
    const res = await db.query(`
      SELECT
        AVG((env_observations->>'qualityScore')::float) AS mean,
        STDDEV((env_observations->>'qualityScore')::float) AS std,
        COUNT(*) AS sample_size
      FROM observations
      WHERE site_id = $1
        AND status IN ('ACCEPTED','CORRECTED')
      LIMIT 20
    `, [siteId]);

    const { mean, std, sample_size } = res.rows[0];
    if (!mean || !std || sample_size < 3) {
      return { isAnomaly: false, zScore: 0, baseline: { mean: 0, std: 0, sampleSize: 0 } };
    }

    const zScore = Math.abs((currentValue - mean) / std);
    return {
      isAnomaly: zScore > 2.0,
      zScore,
      baseline: { mean, std, sampleSize: parseInt(sample_size) },
    };
  }

  async getSiteTimeline(siteId: string, weeks = 12) {
    const res = await db.query(`
      SELECT
        date_trunc('week', o.observed_at)  AS week,
        COUNT(*)                           AS observation_count,
        AVG(o.quality_score)               AS avg_quality_score,
        COUNT(*) FILTER (WHERE o.status IN ('ACCEPTED','CORRECTED')) AS verified_count,
        jsonb_agg(DISTINCT o.env_observations->>'waterClarity') AS clarity_values,
        jsonb_agg(DISTINCT o.env_observations->>'debris')       AS debris_values
      FROM observations o
      WHERE o.site_id = $1
        AND o.observed_at >= NOW() - ($2 || ' weeks')::interval
      GROUP BY 1
      ORDER BY 1 DESC
    `, [siteId, weeks]);
    return res.rows;
  }

  async getSiteTrends(siteId: string) {
    const res = await db.query(`
      SELECT
        env_observations->>'waterClarity' AS clarity,
        env_observations->>'debris'       AS debris,
        env_observations->>'flowRate'     AS flow,
        observed_at
      FROM observations
      WHERE site_id = $1
        AND status IN ('ACCEPTED','CORRECTED')
      ORDER BY observed_at DESC
      LIMIT 10
    `, [siteId]);

    return this.calculateTrends(res.rows);
  }

  private calculateTrends(rows: any[]) {
    const clarityMap: Record<string, number> = {
      clear: 100, slightly_cloudy: 70, cloudy: 40, very_cloudy: 10,
    };

    const clarityValues = rows
      .map(r => clarityMap[r.clarity])
      .filter(Boolean);

    return {
      waterClarity: this.trendArrow(clarityValues),
      observationCount: rows.length,
    };
  }

  private trendArrow(values: number[]): '↑' | '↓' | '→' {
    if (values.length < 2) return '→';
    const slope = (values[0] - values[values.length - 1]) / values.length;
    return slope > 5 ? '↑' : slope < -5 ? '↓' : '→';
  }

  async generateAlerts(siteId: string): Promise<void> {
    // Check for repeated concerning observations in last 7 days
    const res = await db.query(`
      SELECT COUNT(*) AS cnt
      FROM observations
      WHERE site_id = $1
        AND observed_at >= NOW() - INTERVAL '7 days'
        AND (env_observations->>'waterClarity' IN ('cloudy','very_cloudy')
             OR quality_score < 50)
    `, [siteId]);

    const count = parseInt(res.rows[0].cnt);
    if (count >= 3) {
      await db.query(`
        INSERT INTO site_alerts (site_id, alert_type, severity, message)
        VALUES ($1, 'REPEATED_CHANGE', 'HIGH',
                $2)
        ON CONFLICT DO NOTHING
      `, [
        siteId,
        `${count} observations in the last 7 days reported unusual conditions at this site. Verification recommended.`,
      ]);
    }
  }
}

export const anomalyService = new AnomalyService();
