import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

/**
 * PROJECT: FRISCY EMULATOR
 * BASE: MUNICH / SF
 * VIBE: AEON-FLUX / VANTA BLACK
 */

// 1. Service Worker Initialization (Critical for 2GB rootfs caching)
// We use the credentialless mode as per your service-worker.js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => {
        console.log('─── SYSTEM: SERVICE_WORKER_ONLINE');
        // Check for SharedArrayBuffer support immediately
        if (!self.crossOriginIsolated) {
          console.warn('─── WARNING: CROSS_ORIGIN_ISOLATION_MISSING. SAB DISABLED.');
        }
      })
      .catch(err => console.error('─── CRITICAL: SW_REGISTRATION_FAILED', err));
  });
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('SYSTEM_FAILURE: SURFACE_ROOT_NOT_FOUND');
}

// 2. React 19 Root Rendering
// The React Compiler 1.0 will handle optimization during the build.
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
