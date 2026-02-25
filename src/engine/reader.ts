import { useWasmStore } from './store';

/**
 * Standardizes the high-velocity XTerm ring buffer into Zustand.
 */
export function startStdoutReader(stdoutSab: SharedArrayBuffer) {
  const stdoutView = new Int32Array(stdoutSab);
  const stdoutBytes = new Uint8Array(stdoutSab);
  const decoder = new TextDecoder();
  const RING_HEADER = 8;
  const RING_SIZE = 65528;

  const drain = () => {
    const writeHead = Atomics.load(stdoutView, 0);
    const readTail = Atomics.load(stdoutView, 1);

    if (readTail !== writeHead) {
      const chunk = (writeHead > readTail) 
        ? stdoutBytes.slice(RING_HEADER + readTail, RING_HEADER + writeHead)
        : new Uint8Array([
            ...stdoutBytes.slice(RING_HEADER + readTail, RING_HEADER + RING_SIZE),
            ...stdoutBytes.slice(RING_HEADER, RING_HEADER + writeHead)
          ]);

      useWasmStore.getState().appendHistory(decoder.decode(chunk));
      Atomics.store(stdoutView, 1, writeHead);
    }
    requestAnimationFrame(drain);
  };
  drain();
}

/**
 * Synchronizes WASM Atomic Control Pointers (JIT Stats/Status) to Zustand.
 */
export function startBufferReader(controlSab: SharedArrayBuffer) {
  const controlView = new Int32Array(controlSab);
  
  const monitor = () => {
    // [0] = command/status in your worker.js layout
    const status = Atomics.load(controlView, 0);
    const exitCode = Atomics.load(controlView, 5);

    if (status === 4) { // CMD_EXIT in worker.js
      useWasmStore.getState().setExitStatus(exitCode);
    }

    requestAnimationFrame(monitor);
  };
  monitor();
}
