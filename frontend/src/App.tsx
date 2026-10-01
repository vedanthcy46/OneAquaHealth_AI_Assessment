import { useState } from 'react';
import { Header } from './components/Header';
import { CitizenObservationForm } from './components/CitizenObservationForm';
import { ReviewerDashboard } from './components/ReviewerDashboard';
import { SiteHealthDashboard } from './components/SiteHealthDashboard';
import { MyObservations } from './components/MyObservations';
import { FHIRInspector } from './components/FHIRInspector';
import { GoldenDemoRunner } from './components/GoldenDemoRunner';
import { Waves } from 'lucide-react';
import { ImpactBanner } from './components/ImpactBanner';

export function App() {
  const [currentTab, setCurrentTab] = useState<string>('observe');
  const [showGoldenDemo, setShowGoldenDemo] = useState<boolean>(false);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Sticky Header */}
      <Header
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        onLaunchGoldenDemo={() => setShowGoldenDemo(true)}
      />

      {/* Main Content Area */}
      <main style={{ flex: 1 }}>
        {currentTab === 'observe' && (
          <>
            <div className="app-container" style={{ marginTop: '28px' }}>
              <ImpactBanner />
            </div>
            <CitizenObservationForm
              onObservationSubmitted={() => {
                // Observation saved to offline queue
              }}
            />
          </>
        )}

        {currentTab === 'review' && <ReviewerDashboard />}

        {currentTab === 'sites' && <SiteHealthDashboard />}

        {currentTab === 'my-obs' && <MyObservations />}

        {currentTab === 'fhir' && <FHIRInspector />}
      </main>

      {/* 12-Step Golden Demo Runner Modal (Floating) */}
      {showGoldenDemo && (
        <GoldenDemoRunner
          onClose={() => setShowGoldenDemo(false)}
          onNavigateToTab={(tab) => setCurrentTab(tab)}
        />
      )}

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          background: 'rgba(7, 13, 24, 0.95)',
          padding: '24px 20px',
          marginTop: 'auto',
          fontSize: '12px',
          color: 'var(--text-muted)',
        }}
      >
        <div
          style={{
            maxWidth: '1360px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Waves size={16} color="#00f0ff" />
            <span>
              <strong>AquaGuard AI</strong> — Built for{' '}
              <a
                href="https://oneaquahealth.eu"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--text-cyan)', textDecoration: 'none' }}
              >
                OneAquaHealth IEEE Global Hackathon 2026
              </a>{' '}
              (Track 3: AI-Supported Assessment)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span>HL7 FHIR R4 Compliant</span>
            <span>•</span>
            <span>Offline PWA Ready</span>
            <span>•</span>
            <span>PostGIS Geometries</span>
            <span>•</span>
            <span>Member C (Frontend Lead)</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
