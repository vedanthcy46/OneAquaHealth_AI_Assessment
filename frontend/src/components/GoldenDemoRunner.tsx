import React, { useState } from 'react';
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

interface GoldenDemoProps {
  onClose: () => void;
  onNavigateToTab: (tab: string) => void;
}

const DEMO_STEPS = [
  {
    step: 1,
    title: 'Open AquaGuard AI on Mobile',
    action: 'Offline-ready PWA architecture',
    details: 'App shell loads instantly from cache. Works in remote riparian areas without cellular coverage.',
    targetTab: 'observe',
  },
  {
    step: 2,
    title: 'Select "Oslo Urban Rivers — Sagene"',
    action: 'Select registered OneAquaHealth stream site',
    details: 'Pulls baseline clarity average (88/100) and catchment hydrological profile from OneAquaHealth registry.',
    targetTab: 'observe',
  },
  {
    step: 3,
    title: 'Upload First Photo (Dark / Blurry)',
    action: 'Layer A Image Quality Engine runs',
    details: 'Laplacian variance fails (score 28/100). System advises citizen to steady camera and wipe lens.',
    targetTab: 'observe',
  },
  {
    step: 4,
    title: 'Retake with Improved Photo',
    action: 'High-contrast stream capture evaluated',
    details: 'Optical quality passes with score 86/100. Stream corridor confirmed relevant.',
    targetTab: 'observe',
  },
  {
    step: 5,
    title: 'AI Evidence Detection Runs (Layer B)',
    action: 'Multi-indicator vision model inference',
    details: 'Detects Turbidity (94%), Floating Plastic (72%), and Riparian Buffer (94%).',
    targetTab: 'observe',
  },
  {
    step: 6,
    title: 'Adaptive Questions Appear (Layer C)',
    action: '4 targeted questions selected from 25-question bank',
    details: 'Replaces generic 50-field forms with focused queries on streambed depth, plastic debris, and buffer width.',
    targetTab: 'observe',
  },
  {
    step: 7,
    title: 'Citizen Answers "Water is Clear"',
    action: 'Layer D Cross-Validator fires deterministic rule',
    details: 'Contradiction triggered: Citizen report ("Clear") directly conflicts with optical turbidity detection (94%).',
    targetTab: 'observe',
  },
  {
    step: 8,
    title: 'Conflict Card Shown to Citizen',
    action: 'WHAT / WHY / NEXT_ACTION explanation rendered',
    details: 'Citizen is given options to "Keep Answer", "Update to Slightly Cloudy", or "Add Note".',
    targetTab: 'observe',
  },
  {
    step: 9,
    title: 'Confidence Score Calculated (74/100)',
    action: '5-factor weighted algorithm evaluates reliability',
    details: 'Calculates 74/100 (Image: 86, Agreement: 72, Consistency: 60, GPS: 95, History: 55). Routed to REVIEW_REQUIRED.',
    targetTab: 'observe',
  },
  {
    step: 10,
    title: 'Observation Enters Review Queue',
    action: 'Audit trail transition written to database',
    details: 'Flagged report appears in regional expert queue with conflict alert and provenance tag.',
    targetTab: 'review',
  },
  {
    step: 11,
    title: 'Reviewer Inspects Bounding Boxes & Corrects',
    action: 'Expert confirms turbidity and accepts with correction',
    details: 'Original citizen answers preserved intact alongside reviewer correction in separate columns.',
    targetTab: 'review',
  },
  {
    step: 12,
    title: 'Site Dashboard Updates Longitudinal Trend',
    action: 'Longitudinal clarity drop flagged',
    details: 'Toulouse (Marcaissonne aval) shows sustained clarity decline over 4 weeks (Z-score 2.9). Downstream alert fired.',
    targetTab: 'sites',
  },
];

export const GoldenDemoRunner: React.FC<GoldenDemoProps> = ({
  onClose,
  onNavigateToTab,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const current = DEMO_STEPS[currentStepIndex];

  const handleNext = () => {
    if (currentStepIndex < DEMO_STEPS.length - 1) {
      const nextIdx = currentStepIndex + 1;
      setCurrentStepIndex(nextIdx);
      onNavigateToTab(DEMO_STEPS[nextIdx].targetTab);
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      const prevIdx = currentStepIndex - 1;
      setCurrentStepIndex(prevIdx);
      onNavigateToTab(DEMO_STEPS[prevIdx].targetTab);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 1000,
        width: '460px',
        maxWidth: '92vw',
      }}
    >
      <div
        className="glass-panel-glow"
        style={{
          padding: '20px 24px',
          background: 'rgba(7, 13, 24, 0.94)',
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--accent-cyan)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} color="#00f0ff" className="pulse-indicator" />
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-cyan)', textTransform: 'uppercase' }}>
              Golden Demo Walkthrough
            </span>
          </div>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>
            Step {current.step} of 12
          </span>
        </div>

        <h4 style={{ fontSize: '16px', marginBottom: '6px' }}>{current.title}</h4>
        <p style={{ fontSize: '12px', color: 'var(--text-cyan)', fontWeight: 600, marginBottom: '6px' }}>
          Action: {current.action}
        </p>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4', marginBottom: '16px' }}>
          {current.details}
        </p>

        {/* Progress Bar */}
        <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', marginBottom: '16px', overflow: 'hidden' }}>
          <div
            style={{
              width: `${((currentStepIndex + 1) / DEMO_STEPS.length) * 100}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #00f0ff, #10b981)',
              borderRadius: '2px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={onClose}>
            Exit Tour
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px' }}
              onClick={handlePrev}
              disabled={currentStepIndex === 0}
            >
              <ChevronLeft size={14} />
              Prev
            </button>

            <button
              className="btn btn-primary"
              style={{ padding: '6px 14px', fontSize: '12px' }}
              onClick={handleNext}
              disabled={currentStepIndex === DEMO_STEPS.length - 1}
            >
              <span>Next Step</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
