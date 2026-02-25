/**
 * PROJECT: FRISCY_EMULATOR_BOOTSTRAP
 * AUTH: RYAN MACARTHUR
 * ROLE: System Integrity Verification
 */

export const verifySystemIntegrity = () => {
  const isIsolated = window.crossOriginIsolated; //
  const hasSAB = typeof SharedArrayBuffer !== 'undefined';
  
  // 2026 performance metric: Check if we have high-resolution timers enabled by COOP/COEP
  const hasHighRes = performance.now() % 1 !== 0; 

  const diagnostics = {
    COOP_COEP_ISOLATION: isIsolated ? 'ACTIVE' : 'MISSING',
    SHARED_ARRAY_BUFFER: hasSAB ? 'AVAILABLE' : 'BLOCKED',
    HIGH_RES_TIMERS: hasHighRes ? 'ENABLED' : 'DEGRADED',
    USER_AGENT: navigator.userAgent,
    VITE_VERSION: '8.0.0-beta.15', //
  };

  console.group('%c─── FRISCY_SYSTEM_DIAGNOSTICS ───', 'color: #00ff9d; font-weight: bold;');
  console.table(diagnostics);

  if (!isIsolated) {
    console.error('─── FAILURE: Serve.js headers missing. Cross-Origin-Opener-Policy must be "same-origin".');
  }

  if (!hasSAB) {
    console.error('─── FAILURE: SharedArrayBuffer unavailable. Check Service Worker credentialless mode.');
  }

  console.groupEnd();

  return isIsolated && hasSAB;
};
