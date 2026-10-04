import React, { useState, useEffect } from 'react';
import {
  Waves,
  ShieldCheck,
  ClipboardList,
  Activity,
  UserCheck,
  FileCode,
  Wifi,
  WifiOff,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import { OfflineStorageService } from '../services/offlineStorage';

interface HeaderProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onLaunchGoldenDemo?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  onLaunchGoldenDemo,
}) => {
  const [isOnline, setIsOnline] = useState(OfflineStorageService.isOnline());

  useEffect(() => {
    const handleNetworkChange = () => {
      setIsOnline(OfflineStorageService.isOnline());
    };

    window.addEventListener('aquaguard-network-change', handleNetworkChange);
    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('offline', handleNetworkChange);
    return () => {
      window.removeEventListener('aquaguard-network-change', handleNetworkChange);
      window.removeEventListener('online', handleNetworkChange);
      window.removeEventListener('offline', handleNetworkChange);
    };
  }, []);

  const toggleNetworkSimulation = () => {
    const next = !isOnline;
    OfflineStorageService.setSimulatedOnline(next);
    setIsOnline(next);
  };

  return (
    <header className="top-header">
      <div className="nav-row">
        {/* Brand identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #00f0ff 0%, #0284c7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(0, 240, 255, 0.4)',
            }}
          >
            <Waves size={24} color="#070d18" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.02em' }}>
                AquaGuard <span className="text-gradient">AI</span>
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                }}
              >
                IEEE Track 3
              </span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Trusted Citizen Stream Health Assessment
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="nav-tabs" id="main-navigation">
          <button
            id="tab-observe"
            className={`nav-tab-btn ${currentTab === 'observe' ? 'active' : ''}`}
            onClick={() => onSelectTab('observe')}
          >
            <ShieldCheck size={16} />
            <span>Citizen Assess</span>
          </button>

          <button
            id="tab-review"
            className={`nav-tab-btn ${currentTab === 'review' ? 'active' : ''}`}
            onClick={() => onSelectTab('review')}
          >
            <ClipboardList size={16} />
            <span>Reviewer Queue</span>
          </button>

          <button
            id="tab-sites"
            className={`nav-tab-btn ${currentTab === 'sites' ? 'active' : ''}`}
            onClick={() => onSelectTab('sites')}
          >
            <Activity size={16} />
            <span>Site Intelligence</span>
          </button>

          <button
            id="tab-my-obs"
            className={`nav-tab-btn ${currentTab === 'my-obs' ? 'active' : ''}`}
            onClick={() => onSelectTab('my-obs')}
          >
            <UserCheck size={16} />
            <span>My Submissions</span>
          </button>

          <button
            id="tab-fhir"
            className={`nav-tab-btn ${currentTab === 'fhir' ? 'active' : ''}`}
            onClick={() => onSelectTab('fhir')}
          >
            <FileCode size={16} />
            <span>FHIR R4</span>
          </button>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Golden Demo Shortcut */}
          <button
            id="btn-golden-demo-tour"
            className="btn btn-secondary"
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              borderColor: 'rgba(0, 240, 255, 0.4)',
              background: 'rgba(0, 240, 255, 0.08)',
              color: 'var(--text-cyan)',
            }}
            onClick={onLaunchGoldenDemo}
            title="Run interactive 12-step evaluator demo"
          >
            <Sparkles size={14} className="pulse-indicator" />
            <span>12-Step Demo</span>
          </button>

          {/* Network Simulation Badge Toggle */}
          <button
            id="btn-network-toggle"
            onClick={toggleNetworkSimulation}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '999px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              border: isOnline
                ? '1px solid rgba(16, 185, 129, 0.35)'
                : '1px solid rgba(239, 68, 68, 0.35)',
              background: isOnline ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              color: isOnline ? '#34d399' : '#f87171',
              transition: 'all 0.2s ease',
            }}
            title="Click to toggle simulated online/offline PWA sync behavior"
          >
            {isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
            <span>{isOnline ? 'Online (Live)' : 'Offline (Queued)'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
