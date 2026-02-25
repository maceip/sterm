import * as Comlink from 'comlink';

/**
 * PROJECT: FRISCY EMULATOR CORE
 * ROLE: WASM/JIT Orchestration Layer
 */

// We import the Emscripten glue and JIT manager as per your project files
//
let emModule: any = null;
let jitManager: any = null;

export class FriscyWorker {
  private stdoutView: Int32Array | null = null;
  private stdoutBytes: Uint8Array | null = null;

  /**
   * Initialize the Emscripten-compiled RISC-V environment.
   * Leverages the provided friscy.js glue.
   */
  async initializeEngine(config: {
    stdoutSab: SharedArrayBuffer;
    controlSab: SharedArrayBuffer;
  }) {
    // 1. Map the SharedArrayBuffers provided by the main thread
    this.stdoutView = new Int32Array(config.stdoutSab);
    this.stdoutBytes = new Uint8Array(config.stdoutSab);
    
    // 2. Dynamic import of the JIT Manager
    const jitMod = await import(/* @vite-ignore */ './jit_manager.js');
    jitManager = jitMod.default;

    // 3. Instantiate the Emscripten Module
    const { default: createFriscy } = await import(/* @vite-ignore */ './friscy.js');
    
    emModule = await createFriscy({
      noInitialRun: true,
      print: (text: string) => this.writeToRingBuffer(text + '\n'),
      _termWrite: (text: string) => this.writeToRingBuffer(text),
      onExit: (code: number) => {
        // Signal exit via the Control SAB
        const controlView = new Int32Array(config.controlSab);
        Atomics.store(controlView, 5, code); 
        Atomics.store(controlView, 0, 4); // CMD_EXIT
        Atomics.notify(controlView, 0);
      }
    });

    // 4. Initialize JIT with WASM Linear Memory
    const wasmMemory = emModule.wasmMemory || (emModule.asm && emModule.asm.memory);
    if (wasmMemory) {
      jitManager.init(wasmMemory);
    }

    return { ready: true };
  }

  /**
   * Zero-copy write to the Stdout Ring Buffer.
   * Directly mirrors the logic required by your reader.ts.
   */
  private writeToRingBuffer(text: string) {
    if (!this.stdoutView || !this.stdoutBytes) return;

    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    
    const RING_HEADER = 8;
    const RING_SIZE = 65528;

    let writeHead = Atomics.load(this.stdoutView, 0);
    const readTail = Atomics.load(this.stdoutView, 1);

    // Calculate available space in the ring
    for (let i = 0; i < data.length; i++) {
      const nextWriteHead = (writeHead + 1) % RING_SIZE;
      if (nextWriteHead === readTail) break; // Buffer full

      this.stdoutBytes[RING_HEADER + writeHead] = data[i];
      writeHead = nextWriteHead;
    }

    Atomics.store(this.stdoutView, 0, writeHead);
    Atomics.notify(this.stdoutView, 0);
  }

  /**
   * RPC Method to inject data into the emulator's stdin.
   * Replaces the 'stdin-push' message in your raw worker.
   */
  async sendStdin(input: string) {
    if (emModule?._stdinBuffer) {
      const bytes = new TextEncoder().encode(input);
      for (const byte of bytes) {
        emModule._stdinBuffer.push(byte);
      }
    }
  }
}

// Expose an instance via Comlink for the Main Thread
Comlink.expose(new FriscyWorker());
