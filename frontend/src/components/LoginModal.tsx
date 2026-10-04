import React, { useState } from 'react';
import { X, Lock, Mail, User as UserIcon, Shield, CheckCircle, ArrowRight, Sparkles } from 'lucide-react';
import { AuthService, SEEDED_PERSONAS } from '../services/authService';
import type { User } from '../services/authService';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onUserChanged: (user: User) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserChanged,
}) => {
  const [tab, setTab] = useState<'personas' | 'login' | 'register'>('personas');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('Password123!');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleQuickSwitch = async (roleKey: 'citizen' | 'reviewer' | 'admin') => {
    const persona = SEEDED_PERSONAS[roleKey];
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const result = await AuthService.login(persona.email, 'Password123!');
    setLoading(false);

    if (result.success && result.user) {
      onUserChanged(result.user);
      setSuccessMsg(`Switched to ${result.user.displayName} (${result.user.role})!`);
      setTimeout(() => {
        onClose();
        setSuccessMsg(null);
      }, 700);
    } else {
      setErrorMsg(result.error || 'Failed to switch user');
    }
  };

  const handleCustomLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const result = await AuthService.login(email, password);
    setLoading(false);

    if (result.success && result.user) {
      onUserChanged(result.user);
      setSuccessMsg(`Logged in as ${result.user.displayName}!`);
      setTimeout(() => {
        onClose();
        setSuccessMsg(null);
      }, 700);
    } else {
      setErrorMsg(result.error || 'Invalid credentials');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !displayName) {
      setErrorMsg('Please fill in all fields');
      return;
    }
    setLoading(true);
    setErrorMsg(null);

    const result = await AuthService.register(email, password, displayName);
    setLoading(false);

    if (result.success && result.user) {
      onUserChanged(result.user);
      setSuccessMsg(`Account created for ${result.user.displayName}!`);
      setTimeout(() => {
        onClose();
        setSuccessMsg(null);
      }, 700);
    } else {
      setErrorMsg(result.error || 'Registration failed');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(3, 7, 18, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, #0f172a 0%, #090e17 100%)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(56, 189, 248, 0.15)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #0284c7, #00f0ff)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Shield size={20} color="#070d18" />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                Authentication & Roles
              </h2>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                Active: <span style={{ color: '#38bdf8', fontWeight: 600 }}>{currentUser.displayName}</span> ({currentUser.role})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(15, 23, 42, 0.5)',
          }}
        >
          <button
            onClick={() => setTab('personas')}
            style={{
              flex: 1,
              padding: '12px',
              fontSize: '13px',
              fontWeight: 600,
              background: tab === 'personas' ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
              color: tab === 'personas' ? '#38bdf8' : '#94a3b8',
              border: 'none',
              borderBottom: tab === 'personas' ? '2px solid #38bdf8' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            ⚡ Quick Personas
          </button>
          <button
            onClick={() => setTab('login')}
            style={{
              flex: 1,
              padding: '12px',
              fontSize: '13px',
              fontWeight: 600,
              background: tab === 'login' ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
              color: tab === 'login' ? '#38bdf8' : '#94a3b8',
              border: 'none',
              borderBottom: tab === 'login' ? '2px solid #38bdf8' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            🔑 Log In
          </button>
          <button
            onClick={() => setTab('register')}
            style={{
              flex: 1,
              padding: '12px',
              fontSize: '13px',
              fontWeight: 600,
              background: tab === 'register' ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
              color: tab === 'register' ? '#38bdf8' : '#94a3b8',
              border: 'none',
              borderBottom: tab === 'register' ? '2px solid #38bdf8' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            📝 Register
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ padding: '24px' }}>
          {errorMsg && (
            <div
              style={{
                marginBottom: '16px',
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                fontSize: '13px',
              }}
            >
              ⚠️ {errorMsg}
            </div>
          )}

          {successMsg && (
            <div
              style={{
                marginBottom: '16px',
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#34d399',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <CheckCircle size={16} /> {successMsg}
            </div>
          )}

          {/* Persona Switcher Tab */}
          {tab === 'personas' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 4px 0' }}>
                Select a seeded user account to switch identity instantly with full JWT credentials:
              </p>

              {/* Citizen Card */}
              <button
                disabled={loading}
                onClick={() => handleQuickSwitch('citizen')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  background: currentUser.email === 'alice@example.com' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(30, 41, 59, 0.5)',
                  border: currentUser.email === 'alice@example.com' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ fontSize: '24px' }}>🌿</div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
                      Alice Citizen
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                      alice@example.com • Citizen Submitter
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8', fontSize: '12px', fontWeight: 600 }}>
                  <span>Select</span> <ArrowRight size={14} />
                </div>
              </button>

              {/* Reviewer Card */}
              <button
                disabled={loading}
                onClick={() => handleQuickSwitch('reviewer')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  background: currentUser.email === 'reviewer@aquaguard.ai' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(30, 41, 59, 0.5)',
                  border: currentUser.email === 'reviewer@aquaguard.ai' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ fontSize: '24px' }}>🔬</div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
                      Jane Reviewer
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                      reviewer@aquaguard.ai • Expert Scientist
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8', fontSize: '12px', fontWeight: 600 }}>
                  <span>Select</span> <ArrowRight size={14} />
                </div>
              </button>

              {/* Admin Card */}
              <button
                disabled={loading}
                onClick={() => handleQuickSwitch('admin')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  background: currentUser.email === 'admin@aquaguard.ai' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(30, 41, 59, 0.5)',
                  border: currentUser.email === 'admin@aquaguard.ai' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ fontSize: '24px' }}>🛡️</div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
                      Admin User
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                      admin@aquaguard.ai • System Administrator
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8', fontSize: '12px', fontWeight: 600 }}>
                  <span>Select</span> <ArrowRight size={14} />
                </div>
              </button>
            </div>
          )}

          {/* Standard Login Tab */}
          {tab === 'login' && (
            <form onSubmit={handleCustomLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="alice@example.com"
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 36px',
                      borderRadius: '8px',
                      background: '#090e17',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#f8fafc',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                  <Mail size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 36px',
                      borderRadius: '8px',
                      background: '#090e17',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#f8fafc',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                  <Lock size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: '8px',
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #0284c7, #00f0ff)',
                  border: 'none',
                  color: '#070d18',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {loading ? 'Authenticating...' : 'Sign In to AquaGuard'}
              </button>
            </form>
          )}

          {/* Register Tab */}
          {tab === 'register' && (
            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Full Name
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="E.g. Sarah Jenkins"
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 36px',
                      borderRadius: '8px',
                      background: '#090e17',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#f8fafc',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                  <UserIcon size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="sarah@example.com"
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 36px',
                      borderRadius: '8px',
                      background: '#090e17',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#f8fafc',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                  <Mail size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 36px',
                      borderRadius: '8px',
                      background: '#090e17',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#f8fafc',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                  <Lock size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: '8px',
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                  border: 'none',
                  color: '#070d18',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {loading ? 'Registering...' : 'Create Citizen Account'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
