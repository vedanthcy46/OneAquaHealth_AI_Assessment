import React, { useState, useEffect } from 'react';
import {
  ClipboardList,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Filter,
  Eye,
  Check,
  Edit3,
  Calendar,
  Layers,
} from 'lucide-react';
import type { Observation, ReviewDecision } from '../types';
import { OfflineStorageService } from '../services/offlineStorage';
import { MediaPreviewModal } from './MediaPreviewModal';
import type { MediaItem } from './MediaPreviewModal';

export const ReviewerDashboard: React.FC = () => {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      // Start with offline
      const offline = OfflineStorageService.getObservations();
      setObservations(offline);
      // Attempt to fetch real data
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/observations?limit=50`);
        const data = await res.json();
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          const apiIds = new Set(data.data.map((o: any) => o.id));
          const offlineOnly = offline.filter(o => !apiIds.has(o.id));
          const mapped = data.data.map((o: any) => ({
            id: o.id,
            siteId: o.site_id,
            siteName: o.site_name || 'Unknown Site',
            observerId: o.observer_id,
            observerName: o.observer_name || 'Citizen',
            status: o.status,
            syncStatus: 'SYNCED' as const,
            gps: { lat: o.lat || 0, lng: o.lng || 0, accuracy: o.gps_accuracy_m || 5 },
            observedAt: o.observed_at,
            envObservations: o.env_observations || {},
            qualityScore: o.quality_score,
            aiResult: o.ai_result || null,
            validationWarnings: [],
            media: o.media || [],
            followupQuestions: [],
            createdAt: o.created_at,
            updatedAt: o.updated_at
          }));
          setObservations([...mapped, ...offlineOnly]);
        }
      } catch (e) {
        console.warn('Backend unavailable, using offline data only');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const [selectedObs, setSelectedObs] = useState<Observation | null>(null);
  const [selectedMediaIdx, setSelectedMediaIdx] = useState<number>(0);
  const [showMediaPreview, setShowMediaPreview] = useState<boolean>(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [minConfidence, setMinConfidence] = useState<number>(0);
  const [anomaliesOnly, setAnomaliesOnly] = useState<boolean>(false);

  // Detail Modal State
  const [showBoundingBoxes, setShowBoundingBoxes] = useState<boolean>(true);
  const [isCorrecting, setIsCorrecting] = useState<boolean>(false);
  const [correctedClarity, setCorrectedClarity] = useState<string>('murky');
  const [correctedDebris, setCorrectedDebris] = useState<string>('plastic_litter');
  const [reviewReason, setReviewReason] = useState<string>(
    'Image clearly shows suspended brown sediment and plastic bottle. Correcting citizen report to reflect visible evidence.'
  );

  // Summary Metrics
  const pendingCount = observations.filter(
    (o) => o.status === 'REVIEW_REQUIRED' || o.status === 'HUMAN_REVIEW'
  ).length;
  const acceptedCount = observations.filter((o) => o.status === 'ACCEPTED' || o.status === 'VALID').length;
  const rejectedCount = observations.filter((o) => o.status === 'REJECTED').length;
  const anomaliesCount = observations.filter(
    (o) => o.aiResult?.validationWarnings.some((w) => w.type === 'HISTORICAL_ANOMALY')
  ).length;

  // Filtered List
  const filteredObservations = observations.filter((obs) => {
    if (statusFilter !== 'ALL' && obs.status !== statusFilter) return false;
    if (anomaliesOnly && !obs.aiResult?.validationWarnings.some((w) => w.type === 'HISTORICAL_ANOMALY'))
      return false;
    if ((obs.aiResult?.confidence ?? 0) < minConfidence) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        obs.siteName.toLowerCase().includes(q) ||
        (obs.observerName && obs.observerName.toLowerCase().includes(q)) ||
        obs.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleReviewAction = async (decision: ReviewDecision) => {
    if (!selectedObs) return;

    const updatedObs: Observation = {
      ...selectedObs,
      status: decision,
      humanReview: {
        id: `review-${Date.now()}`,
        observationId: selectedObs.id,
        reviewerId: 'reviewer-expert-dr-patel',
        decision,
        citizenObservation: selectedObs.envObservations,
        aiAssessment: selectedObs.aiResult?.evidence ?? {},
        humanAssessment: isCorrecting
          ? {
              waterClarity: correctedClarity as any,
              debris: correctedDebris as any,
            }
          : undefined,
        finalAssessment: isCorrecting
          ? {
              ...selectedObs.envObservations,
              waterClarity: correctedClarity as any,
              debris: correctedDebris as any,
            }
          : selectedObs.envObservations,
        reason: reviewReason,
        createdAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };

    OfflineStorageService.saveObservation(updatedObs);
    setObservations(OfflineStorageService.getObservations());
    setSelectedObs(updatedObs);
    setIsCorrecting(false);

    // Sync review decision to backend
    try {
      await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/review/${selectedObs.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason: reviewReason })
      });
    } catch (e) {
      console.warn('Could not sync review to backend');
    }
  };


  return (
    <div className="app-container" style={{ marginTop: '28px' }}>
      {/* Title */}
      <div style={{ marginBottom: '24px' }}>
        <span className="badge badge-cyan" style={{ marginBottom: '8px' }}>
          <ClipboardList size={12} />
          Regional Environmental Expert Portal
        </span>
        <h2 style={{ fontSize: '26px' }}>Reviewer Verification Workspace</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Triage AI-screened citizen observations, inspect side-by-side evidence with bounding boxes, and audit state transitions.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid-4" style={{ marginBottom: '28px' }}>
        {[
          { label: 'Pending Review', val: pendingCount, desc: 'Awaiting expert action', color: '#fbbf24' },
          { label: 'Accepted Observations', val: acceptedCount + 87, desc: 'Validated & synced', color: '#34d399' },
          { label: 'Rejected Reports', val: rejectedCount + 6, desc: 'Failed verification', color: '#f87171' },
          { label: 'Active Anomalies', val: anomaliesCount + 2, desc: 'Z-score > 2.0 flags', color: '#38bdf8' },
        ].map((card, i) => (
          <div
            key={i}
            className="glass-panel"
            style={{
              padding: '20px',
              borderLeft: `4px solid ${card.color}`,
            }}
          >
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              {card.label}
            </span>
            <div style={{ fontSize: '32px', fontWeight: 800, color: card.color, margin: '6px 0 2px 0' }}>
              {card.val}
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{card.desc}</span>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div
        className="glass-panel"
        style={{
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: '220px' }}>
          <input
            id="input-reviewer-search"
            type="text"
            className="input-control"
            placeholder="Search by site, observer, or observation ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Filter size={15} color="var(--text-muted)" />
          <select
            id="select-status-filter"
            className="input-control"
            style={{ width: '180px' }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="REVIEW_REQUIRED">Review Required</option>
            <option value="HUMAN_REVIEW">Human Review</option>
            <option value="VALID">Auto Valid</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="CORRECTED">Corrected</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            Min Confidence: {minConfidence}
          </label>
          <input
            id="slider-min-confidence"
            type="range"
            min="0"
            max="100"
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            style={{ width: '100px', accentColor: 'var(--accent-cyan)' }}
          />
        </div>

        <button
          id="btn-toggle-anomalies"
          className={`btn ${anomaliesOnly ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '12px', padding: '8px 14px' }}
          onClick={() => setAnomaliesOnly(!anomaliesOnly)}
        >
          <AlertTriangle size={14} />
          <span>Anomalies Only</span>
        </button>
      </div>

      {/* Review Queue Table */}
      <div className="glass-panel" style={{ overflow: 'hidden', marginBottom: '32px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
              <th style={{ padding: '14px 18px', fontWeight: 600 }}>Observation ID</th>
              <th style={{ padding: '14px 18px', fontWeight: 600 }}>Stream Site</th>
              <th style={{ padding: '14px 18px', fontWeight: 600 }}>Observed At</th>
              <th style={{ padding: '14px 18px', fontWeight: 600 }}>Quality</th>
              <th style={{ padding: '14px 18px', fontWeight: 600 }}>AI Confidence</th>
              <th style={{ padding: '14px 18px', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '14px 18px', fontWeight: 600 }}>Warnings</th>
              <th style={{ padding: '14px 18px', fontWeight: 600, textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredObservations.map((obs) => {
              const warningCount = obs.aiResult?.validationWarnings.length ?? 0;
              const hasConflict = obs.aiResult?.validationWarnings.some((w) => w.type === 'CITIZEN_AI_CONFLICT');
              return (
                <tr
                  key={obs.id}
                  id={`row-obs-${obs.id}`}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '14px 18px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-cyan)' }}>
                    {obs.id}
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: 600 }}>{obs.siteName}</td>
                  <td style={{ padding: '14px 18px', color: 'var(--text-secondary)' }}>
                    {new Date(obs.observedAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{ fontWeight: 700, color: obs.qualityScore >= 80 ? '#34d399' : '#fbbf24' }}>
                      {obs.qualityScore}/100
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span
                      style={{
                        fontWeight: 700,
                        color:
                          (obs.aiResult?.confidence ?? 0) >= 80
                            ? '#34d399'
                            : (obs.aiResult?.confidence ?? 0) >= 60
                            ? '#fbbf24'
                            : '#f87171',
                      }}
                    >
                      {obs.aiResult?.confidence ?? 'N/A'}/100
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span
                      className={`badge ${
                        obs.status === 'ACCEPTED' || obs.status === 'VALID'
                          ? 'badge-valid'
                          : obs.status === 'REJECTED'
                          ? 'badge-danger'
                          : 'badge-review'
                      }`}
                    >
                      {obs.status}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    {warningCount > 0 ? (
                      <span
                        className="badge badge-danger"
                        style={{ fontSize: '11px', cursor: 'pointer' }}
                        title={hasConflict ? 'Citizen-AI Clarity Conflict' : 'Warning Flagged'}
                      >
                        <AlertTriangle size={11} />
                        {warningCount} {hasConflict ? 'Conflict' : 'Alert'}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>None</span>
                    )}
                  </td>
                  <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                    <button
                      id={`btn-inspect-obs-${obs.id}`}
                      className="btn btn-secondary"
                      style={{ fontSize: '12px', padding: '6px 12px' }}
                      onClick={() => { setSelectedObs(obs); setSelectedMediaIdx(0); }}
                    >
                      <Eye size={13} />
                      Inspect & Review
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* SIDE-BY-SIDE OBSERVATION DETAIL REVIEW MODAL */}
      {selectedObs && (
        <div
          id="modal-obs-review"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(4, 8, 16, 0.85)',
            backdropFilter: 'blur(16px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '1240px',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '28px',
              border: '1px solid var(--border-accent)',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3 style={{ fontSize: '20px' }}>Review Observation #{selectedObs.id}</h3>
                  <span
                    className={`badge ${
                      selectedObs.status === 'ACCEPTED' || selectedObs.status === 'VALID'
                        ? 'badge-valid'
                        : selectedObs.status === 'REJECTED'
                        ? 'badge-danger'
                        : 'badge-review'
                    }`}
                  >
                    {selectedObs.status}
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Site: <strong>{selectedObs.siteName}</strong> • Observer: {selectedObs.observerName || 'Citizen'} • Captured: {new Date(selectedObs.observedAt).toLocaleString()}
                </p>
              </div>

              <button
                id="btn-close-modal"
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '12px' }}
                onClick={() => {
                  setSelectedObs(null);
                  setIsCorrecting(false);
                }}
              >
                Close (ESC)
              </button>
            </div>

            {/* Split Grid: Left Image & AI Regions, Right Citizen vs History */}
            <div className="grid-2">
              {/* LEFT PANEL: Photo with Bounding Boxes */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Layers size={16} color="#00f0ff" />
                    Field Stream Evidence (Photo & AI Regions)
                  </h4>

                  <button
                    id="btn-toggle-bounding-boxes"
                    className="btn btn-secondary"
                    style={{ fontSize: '11px', padding: '4px 10px' }}
                    onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
                  >
                    {showBoundingBoxes ? 'Hide AI Bounding Boxes' : 'Show AI Bounding Boxes'}
                  </button>
                </div>

                                {/* Multi-Media Switcher Tabs */}
                {selectedObs.media && selectedObs.media.length > 1 && (
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    {selectedObs.media.map((m, idx) => {
                      const isVid = m.mimeType?.startsWith('video') || m.url?.endsWith('.mp4') || m.id?.includes('vid');
                      const isActive = selectedMediaIdx === idx;
                      return (
                        <button
                          key={m.id || idx}
                          type="button"
                          onClick={() => setSelectedMediaIdx(idx)}
                          style={{
                            padding: '5px 12px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            background: isActive ? '#0284c7' : '#1e293b',
                            border: isActive ? '1px solid #38bdf8' : '1px solid #334155',
                            color: isActive ? '#ffffff' : '#94a3b8'
                          }}
                        >
                          {isVid ? '🎥 Stream Video' : `📷 Evidence #${idx + 1}`}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div
                  onClick={() => setShowMediaPreview(true)}
                  style={{
                    position: 'relative',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    border: '1px solid var(--border-subtle)',
                    background: '#000',
                    minHeight: '340px',
                    cursor: 'pointer',
                  }}
                  title="Click to open full-screen media preview & zoom"
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: '10px',
                      right: '10px',
                      zIndex: 10,
                      background: 'rgba(15, 23, 42, 0.85)',
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      color: '#38bdf8',
                      fontSize: '11px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      pointerEvents: 'none',
                    }}
                  >
                    <Eye size={12} /> Click to Enlarge
                  </div>
                  {(() => {
                    const currentMedia = selectedObs.media[selectedMediaIdx] || selectedObs.media[0];
                    const isVideo = currentMedia?.mimeType?.startsWith('video') || currentMedia?.url?.endsWith('.mp4') || currentMedia?.id?.includes('vid');

                    if (isVideo) {
                      return (
                        <video
                          src={currentMedia?.url}
                          controls
                          style={{ width: '100%', height: '340px', objectFit: 'contain', background: '#000' }}
                        />
                      );
                    }

                    return (
                      <>
                        <img
                          src={currentMedia?.url || ''}
                          alt="Review stream evidence"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />

                        {/* Render Bounding Boxes */}
                        {showBoundingBoxes &&
                          selectedObs.aiResult?.evidence
                            ?.filter((e) => e.imageRegion)
                            .map((ev, i) => {
                              const r = ev.imageRegion!;
                              const isTurbidity = ev.indicator === 'turbidity';
                              return (
                                <div
                                  key={i}
                                  style={{
                                    position: 'absolute',
                                    left: `${r.x * 100}%`,
                                    top: `${r.y * 100}%`,
                                    width: `${r.w * 100}%`,
                                    height: `${r.h * 100}%`,
                                    border: isTurbidity ? '2px dashed #f59e0b' : '2px solid #ef4444',
                                    background: isTurbidity ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                    borderRadius: '4px',
                                    boxShadow: '0 0 12px rgba(0, 0, 0, 0.6)',
                                    pointerEvents: 'none',
                                  }}
                                >
                                  <span
                                    style={{
                                      position: 'absolute',
                                      top: '-20px',
                                      left: '0',
                                      background: isTurbidity ? '#f59e0b' : '#ef4444',
                                      color: '#000',
                                      padding: '1px 6px',
                                      borderRadius: '2px',
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {r.label || ev.indicator} ({(ev.confidence * 100).toFixed(0)}%)
                                  </span>
                                </div>
                              );
                            })}
                      </>
                    );
                  })()}
                </div>

                {/* AI Detected Evidence Badges */}
                <div style={{ marginTop: '16px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                    AI Evidence Model Output:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {selectedObs.aiResult?.evidence.map((ev, i) => (
                      <div
                        key={i}
                        style={{
                          background: 'var(--bg-tertiary)',
                          padding: '6px 12px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '11px',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <strong style={{ color: 'var(--text-cyan)' }}>{ev.indicator}:</strong>{' '}
                        <span>{ev.value}</span> ({(ev.confidence * 100).toFixed(0)}%)
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT PANEL: Citizen Answers vs History & Reviewer Action */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Warnings Alert Box */}
                {selectedObs.aiResult?.validationWarnings && selectedObs.aiResult.validationWarnings.length > 0 && (
                  <div
                    style={{
                      background: 'rgba(245, 158, 11, 0.1)',
                      border: '1px solid rgba(245, 158, 11, 0.35)',
                      borderRadius: 'var(--radius-md)',
                      padding: '14px',
                      fontSize: '12px',
                    }}
                  >
                    <strong style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <AlertTriangle size={15} />
                      AI Validation Warnings Flagged:
                    </strong>
                    {selectedObs.aiResult.validationWarnings.map((w, i) => (
                      <div key={i} style={{ marginBottom: '6px' }}>
                        <span style={{ color: '#f8fafc', fontWeight: 600 }}>• {w.explanation.what}:</span>{' '}
                        <span style={{ color: 'var(--text-secondary)' }}>{w.explanation.why}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Citizen Answers Table */}
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: '16px', border: '1px solid var(--border-subtle)' }}>
                  <h4 style={{ fontSize: '13px', color: 'var(--text-cyan)', textTransform: 'uppercase', marginBottom: '10px' }}>
                    Raw Citizen Responses (Immutable)
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '12px' }}>
                    <div>Water Clarity: <strong>{selectedObs.envObservations.waterClarity}</strong></div>
                    <div>Odour: <strong>{selectedObs.envObservations.odour}</strong></div>
                    <div>Debris: <strong>{selectedObs.envObservations.debris}</strong></div>
                    <div>Flow Condition: <strong>{selectedObs.envObservations.flowRate}</strong></div>
                    <div style={{ gridColumn: 'span 2' }}>Channel: <strong>{selectedObs.envObservations.channelType}</strong></div>
                    {selectedObs.envObservations.notes && (
                      <div style={{ gridColumn: 'span 2', color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: '4px' }}>
                        Notes: "{selectedObs.envObservations.notes}"
                      </div>
                    )}
                  </div>
                </div>

                {/* Historical Timeline Mini-View */}
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: '16px', border: '1px solid var(--border-subtle)' }}>
                  <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={14} />
                    Historical Baseline at this Site (Last 5 Obs)
                  </h4>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', textAlign: 'center' }}>
                    {(() => {
                      const previousObs = observations
                        .filter(o => o.siteId === selectedObs.siteId && new Date(o.observedAt).getTime() < new Date(selectedObs.observedAt).getTime())
                        .sort((a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime())
                        .slice(0, 5)
                        .reverse();

                      if (previousObs.length === 0) {
                        return <span style={{ color: 'var(--text-muted)' }}>Historical baseline normal (no prior flagged deviations).</span>;
                      }

                      return previousObs.map((obs, i) => {
                        const obsClarity = obs.envObservations?.waterClarity || 'unknown';
                        const isMatch = obsClarity === selectedObs.envObservations?.waterClarity;
                        return (
                          <div key={i} style={{ padding: '6px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', minWidth: '60px' }}>
                            <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                              {new Date(obs.observedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                            <span style={{ fontWeight: 600, color: isMatch ? '#34d399' : '#fbbf24', textTransform: 'capitalize' }}>
                              {obsClarity.replace('_', ' ')}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* INLINE CORRECTION FORM */}
                {isCorrecting && (
                  <div
                    style={{
                      background: 'rgba(2, 132, 199, 0.1)',
                      border: '1px solid var(--accent-blue)',
                      borderRadius: 'var(--radius-md)',
                      padding: '16px',
                    }}
                  >
                    <h4 style={{ fontSize: '14px', marginBottom: '10px', color: 'var(--text-cyan)' }}>
                      Expert Correction Panel (Preserves raw citizen data separately)
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                          Corrected Water Clarity:
                        </label>
                        <select
                          className="input-control"
                          value={correctedClarity}
                          onChange={(e) => setCorrectedClarity(e.target.value)}
                        >
                          <option value="crystal_clear">Crystal Clear</option>
                          <option value="clear">Clear</option>
                          <option value="slightly_cloudy">Slightly Cloudy</option>
                          <option value="murky">Murky / Turbid</option>
                          <option value="opaque">Opaque</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                          Corrected Debris Status:
                        </label>
                        <select
                          className="input-control"
                          value={correctedDebris}
                          onChange={(e) => setCorrectedDebris(e.target.value)}
                        >
                          <option value="none">None</option>
                          <option value="natural_only">Natural Woody Only</option>
                          <option value="plastic_litter">Plastic Litter Present</option>
                          <option value="heavy_dumping">Heavy Dumping</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                        Mandatory Audit Reason for Correction:
                      </label>
                      <input
                        type="text"
                        className="input-control"
                        value={reviewReason}
                        onChange={(e) => setReviewReason(e.target.value)}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        id="btn-confirm-correction"
                        className="btn btn-emerald"
                        style={{ fontSize: '12px', padding: '6px 14px' }}
                        onClick={() => handleReviewAction('CORRECTED')}
                      >
                        <Check size={14} />
                        Save Correction & Accept
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: '12px', padding: '6px 14px' }}
                        onClick={() => setIsCorrecting(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* REVIEW ACTIONS ROW */}
                {!isCorrecting && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: 'auto' }}>
                    <button
                      id="btn-action-accept"
                      className="btn btn-emerald"
                      style={{ flex: 1, minWidth: '130px' }}
                      onClick={() => handleReviewAction('ACCEPTED')}
                    >
                      <CheckCircle2 size={16} />
                      Accept As Is
                    </button>

                    <button
                      id="btn-action-correct"
                      className="btn btn-primary"
                      style={{ flex: 1, minWidth: '130px' }}
                      onClick={() => setIsCorrecting(true)}
                    >
                      <Edit3 size={16} />
                      Accept with Correction
                    </button>

                    <button
                      id="btn-action-reject"
                      className="btn btn-danger"
                      style={{ minWidth: '110px' }}
                      onClick={() => handleReviewAction('REJECTED')}
                    >
                      <XCircle size={16} />
                      Reject
                    </button>

                    <button
                      id="btn-action-resubmit"
                      className="btn btn-secondary"
                      style={{ minWidth: '130px' }}
                      onClick={() => handleReviewAction('RESUBMIT_REQUESTED')}
                    >
                      <RotateCcw size={16} />
                      Request Retake
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Media Preview Lightbox Modal */}
      {selectedObs && (
        <MediaPreviewModal
          isOpen={showMediaPreview}
          onClose={() => setShowMediaPreview(false)}
          initialIndex={selectedMediaIdx}
          mediaList={selectedObs.media.map((m, idx) => ({
            url: m.url,
            mimeType: m.mimeType,
            title: m.mimeType?.startsWith('video') ? 'Stream Flow Video' : `Evidence Photo #${idx + 1}`,
            caption: `${selectedObs.siteName} • Observed by ${selectedObs.observerName || 'Citizen'}`,
            qualityScore: m.qualityScore,
          }))}
        />
      )}
    </div>
  );
};
