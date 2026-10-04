import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  Eye,
  Calendar,
} from 'lucide-react';
import type { Observation } from '../types';
import { OfflineStorageService } from '../services/offlineStorage';
import { MediaPreviewModal } from './MediaPreviewModal';
import type { MediaItem } from './MediaPreviewModal';

export const MyObservations: React.FC = () => {
  const [observations, setObservations] = useState<Observation[]>(OfflineStorageService.getObservations());
  const [previewModal, setPreviewModal] = useState<{ isOpen: boolean; items: MediaItem[]; initialIndex: number }>({
    isOpen: false,
    items: [],
    initialIndex: 0,
  });

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/observations?limit=100`)
      .then(r => r.json())
      .then(data => {
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
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
            aiResult: null,
            validationWarnings: [],
            media: o.media || [],
            followupQuestions: [],
            createdAt: o.created_at,
            updatedAt: o.updated_at
          }));
          const offline = OfflineStorageService.getObservations();
          const apiIds = new Set(mapped.map((o: any) => o.id));
          const extra = offline.filter(o => !apiIds.has(o.id));
          setObservations([...mapped, ...extra]);
        }
      })
      .catch(() => {});
  }, []);
  const [selectedObs, setSelectedObs] = useState<Observation | null>(null);

  return (
    <div className="app-container" style={{ marginTop: '28px' }}>
      {/* Title */}
      <div style={{ marginBottom: '24px' }}>
        <span className="badge badge-cyan" style={{ marginBottom: '8px' }}>
          <UserCheck size={12} />
          Citizen Contribution Portal
        </span>
        <h2 style={{ fontSize: '26px' }}>My Stream Health Submissions</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Track the lifecycle and verification status of your field observations across local queues and expert reviews.
        </p>
      </div>

      {/* Grid of Submissions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
        {observations.map((obs) => (
          <div
            key={obs.id}
            id={`my-obs-card-${obs.id}`}
            className="glass-panel"
            style={{
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  background: '#000',
                  border: '1px solid var(--border-subtle)',
                  flexShrink: 0,
                }}
              >
                <img
                  src={obs.media[0]?.url || ''}
                  alt="Thumb"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <h4 style={{ fontSize: '16px' }}>{obs.siteName}</h4>
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
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={13} />
                    {new Date(obs.observedAt).toLocaleString()}
                  </span>
                  <span>ID: {obs.id}</span>
                  <span style={{ color: '#34d399' }}>Sync: {obs.syncStatus}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>CONFIDENCE</span>
                <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-cyan)' }}>
                  {obs.aiResult?.confidence ?? 'N/A'}/100
                </span>
              </div>

              <button
                id={`btn-view-details-${obs.id}`}
                className="btn btn-secondary"
                style={{ fontSize: '12px', padding: '8px 14px' }}
                onClick={() => setSelectedObs(obs)}
              >
                <Eye size={14} />
                View Details
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Details Drawer Modal */}
      {selectedObs && (
        <div
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
              maxWidth: '720px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '28px',
              border: '1px solid var(--border-accent)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '20px' }}>Observation #{selectedObs.id}</h3>
              <button className="btn btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setSelectedObs(null)}>
                Close
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '13px' }}>
              <div>
                <strong>Site:</strong> {selectedObs.siteName}
              </div>
              <div>
                <strong>Observation Status:</strong> <span className="badge badge-review">{selectedObs.status}</span>
              </div>
              <div>
                <strong>Reliability Score:</strong> {selectedObs.aiResult?.confidence}/100
              </div>
              <div>
                <strong>AI Explanation:</strong>
                <p style={{ color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.4' }}>
                  {selectedObs.aiResult?.explanation.why}
                </p>
              </div>

              <div style={{ background: 'var(--bg-tertiary)', padding: '14px', borderRadius: 'var(--radius-sm)' }}>
                <strong>Recorded Observations:</strong>
                <ul style={{ paddingLeft: '18px', marginTop: '6px', color: 'var(--text-secondary)' }}>
                  <li>Water Clarity: {selectedObs.envObservations.waterClarity}</li>
                  <li>Odour: {selectedObs.envObservations.odour}</li>
                  <li>Floating Debris: {selectedObs.envObservations.debris}</li>
                  <li>Flow: {selectedObs.envObservations.flowRate}</li>
                  <li>Bank/Channel: {selectedObs.envObservations.channelType}</li>
                </ul>
              </div>

              {/* Uploaded Field Media Evidence */}
              {selectedObs.media && selectedObs.media.length > 0 && (
                <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: 'var(--radius-sm)' }}>
                  <strong style={{ color: '#38bdf8' }}>
                    Uploaded Field Evidence ({selectedObs.media.length} items):
                  </strong>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: '12px',
                      marginTop: '10px'
                    }}
                  >
                    {selectedObs.media.map((m, idx) => {
                      const isVideo = m.mimeType?.startsWith('video') || m.url?.endsWith('.mp4') || m.id?.includes('vid');
                      return (
                        <div
                          key={m.id || idx}
                          onClick={() => {
                            if (!selectedObs.media) return;
                            setPreviewModal({
                              isOpen: true,
                              initialIndex: idx,
                              items: selectedObs.media.map((item, i) => ({
                                url: item.url,
                                mimeType: item.mimeType,
                                title: item.mimeType?.startsWith('video') ? 'Stream Flow Video' : `Evidence #${i + 1}`,
                                caption: `${selectedObs.siteName} • Observed by ${selectedObs.observerName || 'Citizen'}`,
                                qualityScore: item.qualityScore,
                              })),
                            });
                          }}
                          style={{
                            background: '#091122',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            padding: '6px',
                            cursor: 'pointer',
                          }}
                          title="Click to preview full-screen"
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <div style={{ fontSize: '11px', color: isVideo ? '#34d399' : '#38bdf8', fontWeight: 600 }}>
                              {isVideo ? '🎥 Stream Video' : `📷 Evidence #${idx + 1}`}
                            </div>
                            <span style={{ fontSize: '10px', color: '#38bdf8' }}>🔍 Enlarge</span>
                          </div>
                          {isVideo ? (
                            <video
                              src={m.url}
                              style={{ width: '100%', height: '90px', objectFit: 'cover', borderRadius: '4px' }}
                            />
                          ) : (
                            <img
                              src={m.url}
                              alt={`Evidence ${idx + 1}`}
                              style={{ width: '100%', height: '90px', objectFit: 'cover', borderRadius: '4px' }}
                            />
                          )}
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'center' }}>
                            Quality: {m.qualityScore || 90}/100
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Media Preview Modal */}
      <MediaPreviewModal
        isOpen={previewModal.isOpen}
        onClose={() => setPreviewModal((p) => ({ ...p, isOpen: false }))}
        mediaList={previewModal.items}
        initialIndex={previewModal.initialIndex}
      />
    </div>
  );
};
