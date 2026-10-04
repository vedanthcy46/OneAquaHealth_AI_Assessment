import type { Observation, SyncStatus } from '../types';
import { SEEDED_OBSERVATIONS } from '../data/mockData';
import { AuthService } from './authService';

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

  // Bridging the frontend observation to the real backend and media storage!
  private static async syncToBackend(obs: Observation) {
    try {
      const currentUser = AuthService.getCurrentUser();
      let token = currentUser.token;

      // If token missing, authenticate using current user or seed fallback
      if (!token) {
        const authRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: currentUser.email || 'alice@example.com',
            password: 'Password123!',
          }),
        });
        const authData = await authRes.json();
        if (!authData.success) return;
        token = authData.data.token;
      }

      // 2. Resolve valid site UUID for DB foreign key
      let targetSiteId = obs.siteId;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!targetSiteId || !uuidRegex.test(targetSiteId)) {
        try {
          const sitesRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/sites?limit=1`);
          const sitesData = await sitesRes.json();
          if (sitesData.success && Array.isArray(sitesData.data) && sitesData.data.length > 0) {
            targetSiteId = sitesData.data[0].id;
          }
        } catch {
          // fallback
        }
      }

      // 3. Submit the observation to the real DB
      const createRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/observations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          siteId: targetSiteId,
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

      const createData = await createRes.json();
      const serverObsId = createData?.data?.id || obs.id;

      if (!createData.success || !serverObsId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        console.warn('Observation creation failed or returned invalid UUID. Skipping media sync.', createData);
        continue;
      }

      // 4. Upload and persist all photos and video to backend storage
      if (obs.media && obs.media.length > 0) {
        let mediaChanged = false;
        for (const m of obs.media) {
          if (!m.url) continue;
          try {
            let dataUrl = m.url;
            // If blob URL, convert to base64 data URL
            if (dataUrl.startsWith('blob:')) {
              const bRes = await fetch(dataUrl);
              const blob = await bRes.blob();
              dataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
            }

            // Upload to backend media storage
            if (dataUrl.startsWith('data:') || dataUrl.startsWith('http')) {
              const upRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/observations/${serverObsId}/media/upload`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                  dataUrl,
                  mimeType: m.mimeType || 'image/jpeg',
                  qualityScore: m.qualityScore || 90,
                  qualityFactors: m.qualityFactors || {}
                })
              });
              const upData = await upRes.json();
              if (upData.success && upData.data?.url) {
                m.url = upData.data.url;
                mediaChanged = true;
              }
            }
          } catch (mErr) {
            console.warn('Could not sync media item to backend storage', mErr);
          }
        }

        // 5. Update local storage with the permanent server URLs and real DB ID
        const list = this.getObservations();
        const idx = list.findIndex((o) => o.id === obs.id);
        if (idx >= 0) {
          list[idx] = { ...obs, id: serverObsId, syncStatus: 'SYNCED' };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        }
      }
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
