import type { Observation, SyncStatus } from '../types';
import { SEEDED_OBSERVATIONS } from '../data/mockData';

const STORAGE_KEY = 'aquaguard_observations_v1';
const NETWORK_SIM_KEY = 'aquaguard_network_online';

export class OfflineStorageService {
  private static isInitialized = false;

  private static init(): void {
    if (this.isInitialized) return;
    try {
      const existing = localStorage.getItem(STORAGE_KEY);
      if (!existing) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(SEEDED_OBSERVATIONS));
      }
      this.isInitialized = true;
    } catch (e) {
      console.warn('LocalStorage not available, running in-memory fallback', e);
    }
  }

  public static getObservations(): Observation[] {
    this.init();
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : SEEDED_OBSERVATIONS;
    } catch {
      return SEEDED_OBSERVATIONS;
    }
  }

  public static saveObservation(obs: Observation): void {
    this.init();
    try {
      const list = this.getObservations();
      const index = list.findIndex((o) => o.id === obs.id);
      if (index >= 0) {
        list[index] = obs;
      } else {
        list.unshift(obs);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      
      // Sync to the real backend in the background
      if (this.isOnline()) {
        this.syncToBackend(obs).catch(console.error);
      }
    } catch (e) {
      console.error('Failed to save observation to offline storage', e);
    }
  }

  // Bridging the mock frontend to the real backend!
  private static async syncToBackend(obs: Observation) {
    try {
      // 1. Authenticate as a citizen using hardcoded seed credentials
      const authRes = await fetch('http://localhost:3001/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com', password: 'Password123!' })
      });
      const authData = await authRes.json();
      if (!authData.success) return;
      const token = authData.data.token;

      // 2. Submit the observation to the real DB
      await fetch('http://localhost:3001/observations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          siteId: obs.siteId || 'some-site-id',
          localId: obs.id,
          gps: {
            lat: obs.gps?.lat || 0,
            lng: obs.gps?.lng || 0,
            accuracy: obs.gps?.accuracy || 5
          },
          observedAt: obs.observedAt,
          envObservations: obs.envObservations
        })
      });
    } catch (err) {
      console.error('Failed to sync to real backend', err);
    }
  }

  public static updateObservationStatus(
    id: string,
    status: Observation['status'],
    syncStatus?: SyncStatus
  ): void {
    const list = this.getObservations();
    const item = list.find((o) => o.id === id);
    if (item) {
      item.status = status;
      if (syncStatus) item.syncStatus = syncStatus;
      item.updatedAt = new Date().toISOString();
      this.saveObservation(item);
    }
  }

  public static isOnline(): boolean {
    try {
      const val = localStorage.getItem(NETWORK_SIM_KEY);
      if (val !== null) return val === 'true';
    } catch {
      // fallback
    }
    return navigator.onLine;
  }

  public static setSimulatedOnline(online: boolean): void {
    try {
      localStorage.setItem(NETWORK_SIM_KEY, String(online));
      window.dispatchEvent(new Event('aquaguard-network-change'));
    } catch {
      // fallback
    }
  }
}
