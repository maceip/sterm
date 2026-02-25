import { useEffect, useRef, useMemo } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';

// 2026 Elite Pattern: Scoped xterm packages + GPU context recovery
import '@xterm/xterm/css/xterm.css';

export const useTerminal = (options = {}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 1. Terminal instance is stabilized for the React Compiler.
  // We use useMemo to ensure the instance isn't recreated on re-renders,
  // which is crucial when managing 2GB of async data flow.
  const term = useMemo(() => new Terminal({
    cursorBlink: true,
    allowProposedApi: true, // Required for advanced 2026 terminal features
    scrollback: 10000,      // Keep buffer sane for 2GB RAM apps
    ...options
  }), []);

  const fitAddon = useMemo(() => new FitAddon(), []);

  useEffect(() => {
    if (!containerRef.current) return;

    // 2. Initial Setup
    term.open(containerRef.current);
    term.loadAddon(fitAddon);

    // 3. WebGL Addon with Context Recovery
    // In heavy WASM apps, the browser might drop the WebGL context to save RAM.
    const webgl = new WebglAddon();
    
    webgl.onContextLoss(() => {
      console.warn("Terminal WebGL context lost. Disposing addon to prevent leak.");
      webgl.dispose();
    });

    try {
      term.loadAddon(webgl);
    } catch (e) {
      console.warn("WebGL unavailable, falling back to Canvas renderer", e);
    }

    // 4. Industrial Resize Handling
    const resizeObserver = new ResizeObserver(() => {
      // requestAnimationFrame prevents layout thrashing during heavy async updates
      requestAnimationFrame(() => fitAddon.fit());
    });
    
    resizeObserver.observe(containerRef.current);
    fitAddon.fit();

    // 5. Cleanup: Critical for >2GB apps to prevent memory fragmentation
    return () => {
      resizeObserver.disconnect();
      webgl.dispose();
      term.dispose();
    };
  }, [term, fitAddon]);

  return { containerRef, term };
};
