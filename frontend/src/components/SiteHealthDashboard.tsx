import React, { useState, useMemo } from 'react';
import {
  Activity,
  TrendingDown,
  TrendingUp,
  Minus,
  AlertTriangle,
  MapPin,
  CheckCircle2,
} from 'lucide-react';
import { SAMPLE_SITES, MERRI_CREEK_TIMELINE } from '../data/mockData';
import type { Site } from '../types';

const COUNTRY_FLAGS: Record<string, string> = {
  Italy: '🇮🇹',
  Portugal: '🇵🇹',
  Belgium: '🇧🇪',
  Norway: '🇳🇴',
  France: '🇫🇷',
};

/* Derive plausible site-specific ecological trend data */
function buildTrendData(site: Site) {
  const c = site.baseline.clarityScoreAvg;
  const hasAnomalies = site.activeAnomaliesCount > 0;

  // Clarity history based on baseline and anomaly state
  const clarityHistory = hasAnomalies
    ? [`🟢 ${c + 8}`, `🟢 ${c + 4}`, `🟡 ${Math.round(c * 0.85)}`, `🔴 ${Math.round(c * 0.58)}`]
    : [`🟢 ${c}`, `🟢 ${c - 2}`, `🟢 ${c - 3}`, `🟢 ${c - 1}`];

  // Debris based on site baseline
  const debrisMap: Record<string, string[]> = {
    rare: ['🟢 None', '🟢 None', '🟢 None', '🟢 None'],
    occasional: ['🟢 None', '🟢 Low', '🟡 Occasional', '🟡 Occasional'],
    frequent: ['🟡 Low', '🟡 Moderate', '🟠 High', '🔴 Heavy'],
  };
  const debrisHistory = debrisMap[site.baseline.debrisFrequency] ?? debrisMap['occasional'];

  // Riparian context per country
  const riparianNote: Record<string, string> = {
    Italy: 'Riparian scrub & riverine forest intact',
    Portugal: 'Native gallery woodland healthy',
    Belgium: 'Urban quay — minimal vegetation buffer',
    Norway: 'Natural bedrock & boreal fringe stable',
    France: 'Alluvial floodplain gallery present',
  };

  // Flow context per site
  const flowNote: Record<string, string> = {
    'site-oslo': 'Spring snowmelt pulse active',
    'site-toulouse': 'Pyrenean baseflow normal',
    'site-ghent': 'Lock-regulated urban flow',
    'site-coimbra': 'Seasonal low-flow period',
    'site-benevento': 'Mediterranean summer recession',
  };

  return [
    {
      indicator: 'Water Clarity',
      trend: hasAnomalies ? 'down' : 'stable',
      trendLabel: hasAnomalies ? 'Decreasing' : 'Stable',
      color: hasAnomalies ? '#f87171' : '#34d399',
      history: clarityHistory,
      note: hasAnomalies ? 'Anomalous sediment pulse' : 'Within seasonal baseline',
    },
    {
      indicator: 'Floating Debris & Litter',
      trend: site.baseline.debrisFrequency === 'rare' ? 'stable' : site.baseline.debrisFrequency === 'frequent' ? 'up' : 'stable',
      trendLabel: site.baseline.debrisFrequency === 'rare' ? 'Pristine' : site.baseline.debrisFrequency === 'frequent' ? 'Increasing' : 'Stable',
      color: site.baseline.debrisFrequency === 'rare' ? '#34d399' : site.baseline.debrisFrequency === 'frequent' ? '#f87171' : '#fbbf24',
      history: debrisHistory,
      note: site.baseline.debrisFrequency === 'frequent' ? 'CSO/stormwater input suspected' : 'Baseline litter levels',
    },
    {
      indicator: 'Riparian Corridor Buffer',
      trend: 'stable',
      trendLabel: 'Stable',
      color: '#34d399',
      history: ['🟢 Intact', '🟢 Intact', '🟢 Intact', '🟢 Intact'],
      note: riparianNote[site.country] ?? 'Buffer condition normal',
    },
    {
      indicator: 'Stream Flow Condition',
      trend: site.baseline.typicalFlow === 'rapid' ? 'up' : 'stable',
      trendLabel: site.baseline.typicalFlow === 'rapid' ? 'Elevated' : 'Stable',
      color: '#38bdf8',
      history: ['🟡 Moderate', '🟡 Moderate', `🟡 ${site.baseline.typicalFlow.charAt(0).toUpperCase() + site.baseline.typicalFlow.slice(1)}`, `🟡 ${site.baseline.typicalFlow.charAt(0).toUpperCase() + site.baseline.typicalFlow.slice(1)}`],
      note: flowNote[site.id] ?? 'Normal seasonal flow',
    },
    {
      indicator: 'Citizen Submission Quality',
      trend: 'up',
      trendLabel: 'Improving',
      color: '#34d399',
      history: ['🟡 75/100', '🟡 80/100', '🟢 85/100', '🟢 88/100'],
      note: 'Layer A feedback effective',
    },
  ];
}

export const SiteHealthDashboard: React.FC = () => {
  const [selectedSite, setSelectedSite] = useState<Site>(SAMPLE_SITES[0]);

  const trendData = useMemo(() => buildTrendData(selectedSite), [selectedSite]);
  const flag = COUNTRY_FLAGS[selectedSite.country] ?? '🌍';
  const hasAnomalies = selectedSite.activeAnomaliesCount > 0;

  return (
    <div className="app-container" style={{ marginTop: '28px' }}>
      {/* Title */}
      <div style={{ marginBottom: '24px' }}>
        <span className="badge badge-cyan" style={{ marginBottom: '8px' }}>
          <Activity size={12} />
          Longitudinal Environmental Analytics
        </span>
        <h2 style={{ fontSize: '26px' }}>Site Health &amp; Anomaly Intelligence</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Multi-week water quality trends, statistical anomaly detection (Z-scores), and catchment impact
          tracking across all 5 OneAquaHealth research cities.
        </p>
      </div>

      {/* Site Selector */}
      <div
        className="glass-panel"
        style={{
          padding: '20px 24px',
          marginBottom: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', background: 'rgba(0,240,255,0.1)', border: '1px solid rgba(0,240,255,0.3)' }}>
            <MapPin size={24} color="#00f0ff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>{flag}</span>
              <h3 style={{ fontSize: '18px' }}>{selectedSite.name}</h3>
              {hasAnomalies ? (
                <span className="badge badge-review">{selectedSite.activeAnomaliesCount} Active Anomaly{selectedSite.activeAnomaliesCount !== 1 ? 'ies' : ''}</span>
              ) : (
                <span className="badge badge-valid"><CheckCircle2 size={12} />Healthy</span>
              )}
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {selectedSite.waterbody} Â· {selectedSite.city}, {selectedSite.country} Â· Baseline Clarity:{' '}
              {selectedSite.baseline.clarityScoreAvg}/100 Â± {selectedSite.baseline.clarityScoreStd} Â· {selectedSite.recentObservationsCount} verified observations
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {SAMPLE_SITES.map((site) => (
            <button
              key={site.id}
              id={`btn-select-site-${site.id}`}
              className={`btn ${selectedSite.id === site.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '12px', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setSelectedSite(site)}
            >
              <span>{COUNTRY_FLAGS[site.country] ?? 'ðŸŒ'}</span>
              <span>{site.city}</span>
              {site.activeAnomaliesCount > 0 && (
                <span style={{ background: 'rgba(245,158,11,0.25)', color: '#fbbf24', borderRadius: '999px', padding: '0 6px', fontSize: '10px', fontWeight: 700 }}>
                  {site.activeAnomaliesCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Narrative Alert or Healthy Status */}
      {hasAnomalies ? (
        <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 'var(--radius-md)', padding: '16px 20px', marginBottom: '28px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <AlertTriangle size={24} color="#fbbf24" style={{ flexShrink: 0 }} />
          <div>
            <h4 style={{ fontSize: '14px', color: '#fbbf24', marginBottom: '2px' }}>Catchment Sustained Trend Warning — {selectedSite.city}</h4>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
              <strong>{selectedSite.name}</strong> exhibits a sustained downward trend in optical clarity
              across the last {selectedSite.activeAnomaliesCount + 2} observations, coupled with elevated frequency of debris reports.
              Citizen-AI conflict resolution triggered. Downstream municipal notification generated via FHIR R4 alert bundle.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 'var(--radius-md)', padding: '16px 20px', marginBottom: '28px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <CheckCircle2 size={24} color="#34d399" style={{ flexShrink: 0 }} />
          <div>
            <h4 style={{ fontSize: '14px', color: '#34d399', marginBottom: '2px' }}>Site Condition: Healthy — {selectedSite.city}</h4>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
              <strong>{selectedSite.name}</strong> is within normal ecological parameters. All {selectedSite.recentObservationsCount} recent
              observations at this site have passed AI validation (Layers Aâ€“D) without significant anomaly flags.
              Baseline clarity {selectedSite.baseline.clarityScoreAvg}/100 Â± {selectedSite.baseline.clarityScoreStd}.
            </p>
          </div>
        </div>
      )}

      {/* Key Indicators Trend Table */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '28px' }}>
        <h4 style={{ fontSize: '16px', marginBottom: '16px' }}>Ecological Trend Matrix — Last 4 Observation Periods</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {trendData.map((row, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '220px 140px 1fr 220px',
                alignItems: 'center',
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                fontSize: '13px',
                gap: '12px',
              }}
            >
              <span style={{ fontWeight: 600 }}>{row.indicator}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {row.trend === 'down' ? (
                  <TrendingDown size={16} color={row.color} />
                ) : row.trend === 'up' ? (
                  <TrendingUp size={16} color={row.color} />
                ) : (
                  <Minus size={16} color={row.color} />
                )}
                <span style={{ color: row.color, fontWeight: 700 }}>{row.trendLabel}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
                {row.history.map((dot, idx) => (
                  <span key={idx} style={{ background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                    {dot}
                  </span>
                ))}
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'right' }}>{row.note}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Longitudinal Weekly Timeline Visual */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h4 style={{ fontSize: '16px' }}>9-Week Longitudinal Clarity Metrics — {selectedSite.city} ({selectedSite.waterbody})</h4>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Weekly aggregate clarity score Â· Red bars = Z-score anomaly alerts (&gt;2.0)
            </p>
          </div>
          <span className="badge badge-cyan">Aggregated by PostGIS Buffer</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${MERRI_CREEK_TIMELINE.length}, 1fr)`, gap: '12px', alignItems: 'flex-end', minHeight: '220px', paddingTop: '20px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
          {MERRI_CREEK_TIMELINE.map((point, i) => {
            // Scale bar height relative to selected site's clarity baseline
            const scaleFactor = selectedSite.baseline.clarityScoreAvg / 58; // 58 = Ghent reference base
            const displayClarity = Math.min(100, Math.round(point.avgClarity * scaleFactor));
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                {point.isAnomaly && (
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#f87171', background: 'rgba(239,68,68,0.2)', padding: '1px 4px', borderRadius: '3px' }}>
                    Z={point.zScore.toFixed(1)}
                  </span>
                )}
                <div
                  style={{
                    width: '100%',
                    maxWidth: '42px',
                    height: `${displayClarity * 1.8}px`,
                    background: point.isAnomaly
                      ? 'linear-gradient(180deg, #ef4444 0%, #7f1d1d 100%)'
                      : 'linear-gradient(180deg, #00f0ff 0%, #0284c7 100%)',
                    borderRadius: '6px 6px 0 0',
                    boxShadow: point.isAnomaly ? '0 0 14px rgba(239,68,68,0.4)' : 'none',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    paddingTop: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#ffffff',
                  }}
                  title={`Week ${point.week}: Clarity ~${displayClarity}/100 (${point.observationCount} obs)`}
                >
                  {displayClarity}
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{point.dateLabel}</span>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '12px', background: '#00f0ff', borderRadius: '2px' }} />
              <span>Normal Seasonal Baseline</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '12px', background: '#ef4444', borderRadius: '2px' }} />
              <span>Statistical Anomaly Alert (Z &gt; 2.0)</span>
            </div>
          </div>
          <span>PostGIS temporal aggregations Â· {selectedSite.city}, {selectedSite.country}</span>
        </div>
      </div>
    </div>
  );
};

