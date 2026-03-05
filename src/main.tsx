import ReactDOM from 'react-dom/client';

import App from './App';
import './index.css';

/**
 * PROJECT: FRISCY EMULATOR
 * BASE: MUNICH / SF
 * VIBE: AEON-FLUX / VANTA BLACK
 */

const clearDevServiceWorkers = async () => {
  if (!('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    console.log('─── DEV: service workers and caches cleared');
  } catch (err) {
    console.warn('─── DEV: failed to clear service workers/caches', err);
  }
};

// Service worker is production-only. In dev it can hijack Vite module URLs.
if ('serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    void clearDevServiceWorkers();
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then(() => {
          console.log('─── SYSTEM: SERVICE_WORKER_ONLINE');
          if (!self.crossOriginIsolated) {
            console.warn('─── WARNING: CROSS_ORIGIN_ISOLATION_MISSING. SAB DISABLED.');
          }
        })
        .catch((err) => console.error('─── CRITICAL: SW_REGISTRATION_FAILED', err));
    });
  }
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('SYSTEM_FAILURE: SURFACE_ROOT_NOT_FOUND');
}

ReactDOM.createRoot(rootElement).render(<App />);
