import React, { useEffect, useTransition } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import * as Comlink from 'comlink';

// Engine logic and state management
import { 
  useWasmStore, 
  terminalSearchAtom, 
  filteredHistoryAtom 
} from './engine/store';
import { startStdoutReader, startBufferReader } from './engine/reader';
import { verifySystemIntegrity } from './engine/setup';
import { runHarnessTest } from './engine/harness';

// UI Hooks and Components
import { useTerminal } from './ui/hooks/useTerminal';

/**
 * PROJECT: FRISCY EMULATOR WORKSTATION
 * FEB 25, 2026 EDITION
 * THEME: AEON-FLUX / VANTA-BLACK
 */

// Instantiate the Comlink Worker outside the component to persist through HMR
const workerInstance = new ComlinkWorker(
  new URL('./engine/wasm.worker.ts', import.meta.url),
  { type: 'module' }
);

export default function App() {
  const { containerRef, term } = useTerminal();
  const [isPending, startTransition] = useTransition(); // React 19 Transition
  
  // Jotai for granular UI fragments
  const [search, setSearch] = useAtom(terminalSearchAtom);
  const filteredLines = useAtomValue(filteredHistoryAtom);

  // 1. SYSTEM BOOTSTRAP
  useEffect(() => {
    // Perform pre-flight integrity check (COOP/COEP & SAB)
    const sysOk = verifySystemIntegrity();
    
    if (sysOk) {
      startTransition(async () => {
        try {
          // Allocate SharedArrayBuffers for the ring buffer protocol
          const stdoutSab = new SharedArrayBuffer(65536); // 64KB ring
          const controlSab = new SharedArrayBuffer(64);   // Control signals

          // Initialize the friscy.wasm engine via Comlink RPC
          await workerInstance.initializeEngine({ stdoutSab, controlSab });

          // Connect SharedArrayBuffer readers to Zustand
          startStdoutReader(stdoutSab);
          startBufferReader(controlSab);
          
          useWasmStore.getState().setReady(true);
          
          // Trigger the automated test harness if in test mode
          const urlParams = new URLSearchParams(window.location.search);
          if (urlParams.get('test') === 'true' && term) {
            // Signal to worker to generate a verifiable output
            await workerInstance.sendStdin('echo "AEON_SYSTEM_READY"\n');
            runHarnessTest(term, "AEON_SYSTEM_READY");
          }
        } catch (error) {
          console.error('─── SYSTEM_BOOT_FAILURE:', error);
        }
      });
    }
  }, [term]);

  // 2. DIRECT TERMINAL PIPE (Zero-React Overhead)
  // Pipes Zustand updates directly into xterm.js instance
  useEffect(() => {
    if (!term) return;
    
    const unsubscribe = useWasmStore.subscribe(
      (state) => state.lastChunk,
      (chunk) => {
        if (chunk) term.write(chunk);
      }
    );

    // Pipe user keystrokes from Terminal back to WASM Worker
    const inputDisposable = term.onData((data: string) => {
      workerInstance.sendStdin(data);
    });

    return () => {
      unsubscribe();
      inputDisposable.dispose();
    };
  }, [term]);

  return (
    <div className="flex h-screen w-screen flex-col bg-[#020202] text-[#d4d4d4] font-mono selection:bg-[#00ff9d]/30">
      {/* INDUSTRIAL HUD */}
      <header className="flex h-12 items-center justify-between border-b border-white/5 px-6 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className={`h-2 w-2 rounded-full ${isPending ? 'bg-yellow-500 animate-pulse' : 'bg-[#00ff9d]'}`} />
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-50">
            FRISCY_RISCV // 2.0GB_CORE
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          <input 
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="FILTER_SINK..."
            className="bg-white/5 border border-white/10 text-[10px] px-3 py-1 rounded focus:border-[#00ff9d]/50 outline-none transition-colors"
          />
          <div className="text-[9px] opacity-30">
            {isPending ? 'BOOTING...' : 'KERNEL_STABLE'}
          </div>
        </div>
      </header>

      {/* TERMINAL SURFACE */}
      <main className="relative flex-1 overflow-hidden">
        <div 
          ref={containerRef} 
          className="h-full w-full p-4" 
        />
        
        {/* DYNAMIC JOTAI OVERLAY */}
        {search && (
          <div className="absolute top-6 right-6 w-80 max-h-[60%] bg-[#0a0a0a]/90 border border-[#00ff9d]/20 p-4 overflow-y-auto backdrop-blur-xl shadow-2xl">
            <div className="text-[9px] text-[#00ff9d] mb-3 font-bold border-b border-[#00ff9d]/10 pb-1">
              MATCH_FOUND: {filteredLines.length}
            </div>
            {filteredLines.slice(-20).map((line, i) => (
              <div key={i} className="text-[9px] py-0.5 border-b border-white/5 opacity-80 hover:opacity-100">
                {line}
              </div>
            ))}
          </div>
        )}

        {/* LOADING SHIM */}
        {isPending && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#020202]/80 pointer-events-none">
            <div className="flex flex-col items-center gap-4">
              <div className="h-[1px] w-64 bg-white/10 overflow-hidden">
                <div className="h-full bg-[#00ff9d] animate-[loading_1.5s_infinite]" />
              </div>
              <span className="text-[8px] tracking-[0.4em] uppercase opacity-40">Allocating WASM Heap...</span>
            </div>
          </div>
        )}
      </main>

      {/* SYSTEM FOOTER */}
      <footer className="h-8 border-t border-white/5 flex items-center px-6 justify-between text-[8px] opacity-20 font-mono tracking-widest">
        <span>&copy; 2026 INDUSTRIAL CONTEXT</span>
        <div className="flex gap-6">
          <span>COOP_COEP: OK</span>
          <span>SAB_RING: 64KB</span>
          <span>THREADS: ENABLED</span>
        </div>
      </footer>

      {/* Global Animation Utility */}
      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
