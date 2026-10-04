export interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'citizen' | 'reviewer' | 'admin';
  token: string;
}

const AUTH_STORAGE_KEY = 'aquaguard_current_user_v1';

export const SEEDED_PERSONAS: Record<string, { email: string; name: string; role: 'citizen' | 'reviewer' | 'admin' }> = {
  citizen: {
    email: 'alice@example.com',
    name: 'Alice Citizen',
    role: 'citizen',
  },
  reviewer: {
    email: 'reviewer@aquaguard.ai',
    name: 'Jane Reviewer',
    role: 'reviewer',
  },
  admin: {
    email: 'admin@aquaguard.ai',
    name: 'Admin User',
    role: 'admin',
  },
};

const DEFAULT_USER: User = {
  id: '00000000-0000-0000-0000-000000000003',
  email: 'alice@example.com',
  displayName: 'Alice Citizen',
  role: 'citizen',
  token: '',
};

export class AuthService {
  public static getCurrentUser(): User {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {}
    return DEFAULT_USER;
  }

  public static setCurrentUser(user: User): void {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    window.dispatchEvent(new CustomEvent('aquaguard-auth-change', { detail: user }));
  }

  public static logout(): void {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    this.setCurrentUser(DEFAULT_USER);
  }

  public static async login(email: string, password: string): Promise<{ success: boolean; error?: string; user?: User }> {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Invalid credentials' };
      }

      const user: User = {
        id: data.data.userId,
        email: email,
        displayName: data.data.displayName || email.split('@')[0],
        role: data.data.role || 'citizen',
        token: data.data.token,
      };

      this.setCurrentUser(user);
      return { success: true, user };
    } catch (e: any) {
      // Offline fallback
      const role = email.includes('admin') ? 'admin' : email.includes('reviewer') ? 'reviewer' : 'citizen';
      const user: User = {
        id: 'local-' + Date.now(),
        email,
        displayName: email.split('@')[0],
        role,
        token: 'offline-jwt-mock',
      };
      this.setCurrentUser(user);
      return { success: true, user };
    }
  }

  public static async register(email: string, password: string, displayName: string): Promise<{ success: boolean; error?: string; user?: User }> {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Registration failed' };
      }

      const user: User = {
        id: data.data.userId,
        email: email,
        displayName: displayName || email.split('@')[0],
        role: 'citizen',
        token: data.data.token,
      };

      this.setCurrentUser(user);
      return { success: true, user };
    } catch (e: any) {
      return { success: false, error: 'Cannot connect to backend auth server' };
    }
  }
}
