import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { verifySystemIntegrity } from './engine/setup';
import { useTerminal } from './ui/hooks/useTerminal';

const CMD_IDLE = 0;
const CMD_STDIN_REQUEST = 2;
const CMD_STDIN_READY = 3;
const CMD_EXPORT_VFS = 8;

const RING_HEADER = 8;
const RING_SIZE = 65528;
const MAX_TERMINAL_TRANSCRIPT_CHARS = 1_000_000;

const getTerminalBufferText = (term: any): string => {
  if (!term?.buffer?.active) return "";
  const buffer = term.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < buffer.length; i += 1) {
    const line = buffer.getLine(i);
    if (line) lines.push(line.translateToString(true));
  }
  return lines.join("\n");
};

type StareTermDebugPane = {
  getTranscript: () => string;
  getBufferText: () => string;
  sendInput: (text: string) => void;
  getStatus: () => string;
};

type StareTermWindow = Window & {
  __stareTermDebug?: Record<string, StareTermDebugPane>;
  __stareTermAutomationEnabled?: boolean;
};

type GuestKind = 'claude' | 'nodejs' | 'alpine' | 'gemini' | 'codex';

type KeyState = {
  anthropic: string;
  gemini: string;
  openai: string;
};

type GuestProfile = {
  id: GuestKind;
  title: string;
  rootfs: string;
  checkpoint?: string;
  entrypoint: string[];
  allowNetwork: boolean;
  env: (keys: KeyState) => string[];
  quickCommands: Array<{ label: string; command: string }>;
};

type Preset = {
  id: string;
  label: string;
  slots: GuestKind[];
};

const PROFILES: Record<GuestKind, GuestProfile> = {
  claude: {
    id: 'claude',
    title: 'Claude CLI',
    rootfs: '/claude-slim.tar',
    checkpoint: '/claude-repl.ckpt',
    entrypoint: [
      '/usr/bin/node',
      '--jitless',
      '--max-old-space-size=256',
      '/usr/local/bin/claude-repl.js',
    ],
    allowNetwork: true,
    env: (keys) => [`ANTHROPIC_API_KEY=${keys.anthropic}`],
    quickCommands: [
      { label: 'mcp list', command: 'claude mcp list\n' },
      { label: 'haiku', command: 'claude -p "write me a haiku"\n' },
      { label: 'limerick', command: 'claude -p "write me a limerick"\n' },
    ],
  },
  nodejs: {
    id: 'nodejs',
    title: 'Node.js REPL',
    rootfs: '/claude-slim.tar',
    entrypoint: [
      '/usr/bin/node',
      '--jitless',
      '--max-old-space-size=256',
    ],
    allowNetwork: true,
    env: () => [],
    quickCommands: [
      { label: 'version', command: 'process.version\n' },
      { label: 'sha256', command: "const crypto = require('crypto'); console.log(crypto.createHash('sha256').update('your_string_here').digest('hex'))\n" },
    ],
  },
  alpine: {
    id: 'alpine',
    title: 'Alpine Shell',
    rootfs: '/rootfs.tar',
    entrypoint: ['/bin/sh', '-i'],
    allowNetwork: true,
    env: () => [],
    quickCommands: [
      { label: 'ls', command: 'ls\n' },
      { label: 'sha256', command: 'echo test > /tmp/a && sha256sum /tmp/a\n' },
      { label: 'curl', command: 'curl -I https://stare.network\n' },
    ],
  },
  gemini: {
    id: 'gemini',
    title: 'Gemini CLI',
    rootfs: '/gemini-r2.tar',
    entrypoint: ['/usr/bin/node', '/usr/local/lib/node_modules/@google/gemini-cli/dist/index.js'],
    allowNetwork: true,
    env: (keys) => [
      'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      'HOME=/root',
      'TERM=xterm-256color',
      'COLORTERM=truecolor',
      `GEMINI_API_KEY=${keys.gemini}`,
      `GOOGLE_API_KEY=${keys.gemini}`,
    ],
    quickCommands: [
      { label: 'haiku', command: 'gemini -p "write me a haiku"\n' },
      { label: 'limerick', command: 'gemini -p "write me a limerick"\n' },
    ],
  },
  codex: {
    id: 'codex',
    title: 'Codex CLI',
    rootfs: '/codex.tar',
    entrypoint: ['/usr/local/bin/codex'],
    allowNetwork: true,
    env: (keys) => [
      'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      'HOME=/root',
      'TERM=xterm-256color',
      'COLORTERM=truecolor',
      `OPENAI_API_KEY=${keys.openai}`,
    ],
    quickCommands: [
      { label: 'haiku', command: "codex e 'write me a haiku'\n" },
      { label: 'limerick', command: "codex e 'write me a limerick'\n" },
    ],
  },
};

const PRESETS: Preset[] = [
  { id: 'nodejs-solo', label: 'nodejs (solo)', slots: ['nodejs'] },
  { id: 'claude-solo', label: 'claude (solo)', slots: ['claude'] },
  { id: 'gemini-solo', label: 'gemini (solo)', slots: ['gemini'] },
  { id: 'codex-solo', label: 'codex (solo)', slots: ['codex'] },
  { id: 'gemini-codex-duo', label: 'gemini + codex (dual full)', slots: ['gemini', 'codex'] },
  { id: 'min-bed', label: 'claude + alpine (min bed)', slots: ['claude', 'alpine'] },
  { id: 'heating-up', label: 'claude + gemini (heating up)', slots: ['claude', 'gemini'] },
  { id: 'orly', label: 'claude + gemini + alpine (orly)', slots: ['claude', 'gemini', 'alpine'] },
  { id: 'tits', label: 'claude + gemini + codex (tits)', slots: ['claude', 'gemini', 'codex'] },
  { id: 'golfclap', label: 'claude + alpine + alping (golfclap)', slots: ['claude', 'alpine', 'alpine'] },
];

const TIER2_INIT_OPTIONS = {
  enableJit: true,
  jitTierEnabled: true,
  timesliceResumeEnabled: true,
  jitPrewarmEnabled: true,
  jitAwaitCompiler: false,
  jitMarkovEnabled: true,
  jitTripletEnabled: true,
  jitTraceEnabled: true,
  jitHotThreshold: 16,
  jitOptimizeThreshold: 64,
  jitSchedulerBudget: 32,
  jitSchedulerConcurrency: 2,
  jitSchedulerQueueMax: 128,
  jitPredictTopK: 4,
  jitPredictConfidence: 60,
  jitEdgeHotThreshold: 8,
  jitTraceTripletHotThreshold: 6,
};

const assetMemCache = new Map<string, Promise<ArrayBuffer>>();

const sanitizeTerminalOutput = (
  text: string,
  stdoutCarryRef: React.MutableRefObject<string>,
  queueBytes: (bytes: number[]) => void,
): string => {
  const dsrQuery = '\x1b[6n';
  let combined = stdoutCarryRef.current + text;
  stdoutCarryRef.current = '';

  let idx = combined.indexOf(dsrQuery);
  while (idx !== -1) {
    queueBytes([0x1b, 0x5b, 0x31, 0x3b, 0x31, 0x52]);
    combined = combined.slice(0, idx) + combined.slice(idx + dsrQuery.length);
    idx = combined.indexOf(dsrQuery);
  }

  const partials = ['\x1b', '\x1b[', '\x1b[6'];
  for (const partial of partials) {
    if (combined.endsWith(partial)) {
      stdoutCarryRef.current = partial;
      combined = combined.slice(0, -partial.length);
      break;
    }
  }

  return combined;
};

const opfsKeyFor = (url: string) => url.replace(/[^a-zA-Z0-9_.-]/g, '_');

const getOpfsDir = async (subdir: 'assets' | 'overlays') => {
  if (!('storage' in navigator) || !('getDirectory' in navigator.storage)) return null;
  try {
    const root = await navigator.storage.getDirectory();
    const appDir = await root.getDirectoryHandle('stare-term', { create: true });
    const dir = await appDir.getDirectoryHandle(subdir, { create: true });
    return dir;
  } catch {
    return null;
  }
};

const readOpfsFile = async (subdir: 'assets' | 'overlays', key: string) => {
  const dir = await getOpfsDir(subdir);
  if (!dir) return null;
  try {
    const handle = await dir.getFileHandle(key, { create: false });
    const file = await handle.getFile();
    return await file.arrayBuffer();
  } catch {
    return null;
  }
};

const writeOpfsFile = async (subdir: 'assets' | 'overlays', key: string, data: ArrayBuffer) => {
  const dir = await getOpfsDir(subdir);
  if (!dir) return false;
  try {
    const handle = await dir.getFileHandle(key, { create: true });
    const writer = await handle.createWritable();
    await writer.write(new Uint8Array(data));
    await writer.close();
    return true;
  } catch {
    return false;
  }
};

const loadAsset = async (url: string, opfsCache: boolean): Promise<ArrayBuffer> => {
  let cached = assetMemCache.get(url);
  if (!cached) {
    cached = (async () => {
      if (opfsCache) {
        const fromOpfs = await readOpfsFile('assets', opfsKeyFor(url));
        if (fromOpfs) return fromOpfs;
      }

      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) {
        throw new Error(`asset fetch failed (${url}): HTTP ${resp.status}`);
      }
      const data = await resp.arrayBuffer();

      if (opfsCache) {
        void writeOpfsFile('assets', opfsKeyFor(url), data);
      }
      return data;
    })().catch((err) => {
      assetMemCache.delete(url);
      throw err;
    });

    assetMemCache.set(url, cached);
  }
  return cached;
};

type TerminalPaneProps = {
  paneId: string;
  paneIndex: number;
  texturedFrame: boolean;
  profile: GuestProfile;
  keys: KeyState;
  bootVersion: number;
  opfsCache: boolean;
  isolatedReady: boolean;
};

function TerminalPane({ paneId, paneIndex, texturedFrame, profile, keys, bootVersion, opfsCache, isolatedReady }: TerminalPaneProps) {
  const { containerRef, term } = useTerminal();

  const [status, setStatus] = useState('idle');
  const [booting, setBooting] = useState(false);
  const [running, setRunning] = useState(false);
  const [stage2, setStage2] = useState<'idle' | 'activating' | 'active' | 'error'>('idle');
  const [opfsStatus, setOpfsStatus] = useState('opfs idle');

  const workerRef = useRef<Worker | null>(null);
  const controlViewRef = useRef<Int32Array | null>(null);
  const controlBytesRef = useRef<Uint8Array | null>(null);
  const stdoutViewRef = useRef<Int32Array | null>(null);
  const stdoutBytesRef = useRef<Uint8Array | null>(null);
  const stdinQueueRef = useRef<number[]>([]);
  const stdoutCarryRef = useRef('');
  const stdinPollRef = useRef<number | null>(null);
  const stdoutPollRef = useRef<number | null>(null);
  const exportWaiterRef = useRef<
    | { resolve: (buf: ArrayBuffer) => void; reject: (err: Error) => void; timeoutId: number }
    | null
  >(null);
  const lastHandledBootVersionRef = useRef(0);
  const outputRef = useRef('');

  const isWrapperEntrypoint = useMemo(
    () => profile.entrypoint.some((arg) => arg.endsWith('-repl.js')),
    [profile.entrypoint],
  );

  const isWrapperLineMode = isWrapperEntrypoint;

  const appendOutput = useCallback((text: string) => {
    if (!text) return;
    const next = outputRef.current + text;
    if (next.length > MAX_TERMINAL_TRANSCRIPT_CHARS) {
      outputRef.current = next.slice(next.length - MAX_TERMINAL_TRANSCRIPT_CHARS);
      return;
    }
    outputRef.current = next;
  }, []);

  const writeTerm = useCallback((text: string) => {
    if (!text) return;
    appendOutput(text);
    term?.write(text);
  }, [appendOutput, term]);

  const queueBytes = useCallback((bytes: number[]) => {
    for (const b of bytes) stdinQueueRef.current.push(b);
  }, []);

  const checkStdinRequest = useCallback(() => {
    const controlView = controlViewRef.current;
    const controlBytes = controlBytesRef.current;
    if (!controlView || !controlBytes) return;
    if (Atomics.load(controlView, 0) !== CMD_STDIN_REQUEST) return;
    if (stdinQueueRef.current.length === 0) return;

    const maxLen = Math.max(1, Atomics.load(controlView, 2) || 1);
    const n = Math.min(maxLen, stdinQueueRef.current.length, 3968);

    for (let i = 0; i < n; i += 1) {
      controlBytes[64 + i] = stdinQueueRef.current.shift() ?? 0;
    }

    Atomics.store(controlView, 2, n);
    Atomics.store(controlView, 0, CMD_STDIN_READY);
    Atomics.notify(controlView, 0);
  }, []);

  const queueInput = useCallback(
    (text: string) => {
      const bytes = new TextEncoder().encode(text);
      queueBytes(Array.from(bytes));

      const controlView = controlViewRef.current;
      const controlBytes = controlBytesRef.current;
      if (controlView && controlBytes && Atomics.load(controlView, 0) === CMD_IDLE && stdinQueueRef.current.length > 0) {
        const n = Math.min(stdinQueueRef.current.length, 3968);
        for (let i = 0; i < n; i += 1) {
          controlBytes[64 + i] = stdinQueueRef.current.shift() ?? 0;
        }
        Atomics.store(controlView, 2, n);
        Atomics.store(controlView, 0, CMD_STDIN_READY);
        Atomics.notify(controlView, 0);
      }

      checkStdinRequest();
    },
    [checkStdinRequest, queueBytes],
  );

  const stop = useCallback(() => {
    if (stdinPollRef.current !== null) {
      window.clearInterval(stdinPollRef.current);
      stdinPollRef.current = null;
    }
    if (stdoutPollRef.current !== null) {
      window.clearInterval(stdoutPollRef.current);
      stdoutPollRef.current = null;
    }

    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    if (exportWaiterRef.current) {
      window.clearTimeout(exportWaiterRef.current.timeoutId);
      exportWaiterRef.current.reject(new Error('runtime stopped'));
      exportWaiterRef.current = null;
    }

    stdinQueueRef.current = [];
    setRunning(false);
    setBooting(false);
    setStatus('stopped');
    setStage2('idle');
  }, []);

  const requestOverlayExport = useCallback(async () => {
    const controlView = controlViewRef.current;
    if (!controlView) throw new Error('control SAB unavailable');

    const data = await new Promise<ArrayBuffer>((resolve, reject) => {
      if (exportWaiterRef.current) {
        reject(new Error('overlay export already in progress'));
        return;
      }

      const timeoutId = window.setTimeout(() => {
        if (!exportWaiterRef.current) return;
        exportWaiterRef.current = null;
        reject(new Error('overlay export timed out'));
      }, 30000);

      exportWaiterRef.current = { resolve, reject, timeoutId };
      Atomics.store(controlView, 0, CMD_EXPORT_VFS);
      Atomics.notify(controlView, 0);
    });

    return data;
  }, []);

  const saveOverlayToOpfs = useCallback(async () => {
    if (!running) return;
    setOpfsStatus('opfs export...');
    try {
      const data = await requestOverlayExport();
      const key = `${paneId}.overlay.tar`;
      const ok = await writeOpfsFile('overlays', key, data);
      if (!ok) throw new Error('write failed');
      setOpfsStatus(`opfs saved ${(data.byteLength / (1024 * 1024)).toFixed(1)} MB`);
    } catch (err) {
      setOpfsStatus(`opfs export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [paneId, requestOverlayExport, running]);

  const boot = useCallback(async () => {
    if (!term || booting) return;
    if (!isolatedReady) {
      setStatus('blocked: cross-origin isolation missing');
      writeTerm('\r\n[boot] blocked: cross-origin isolation missing.\r\n');
      return;
    }

    stop();
    setBooting(true);
    setStatus('booting');
    setStage2('idle');
    outputRef.current = '';

    try {
      const stdoutSab = new SharedArrayBuffer(65536);
      const controlSab = new SharedArrayBuffer(4096);
      const controlView = new Int32Array(controlSab);
      const controlBytes = new Uint8Array(controlSab);
      const stdoutView = new Int32Array(stdoutSab);
      const stdoutBytes = new Uint8Array(stdoutSab);

      controlViewRef.current = controlView;
      controlBytesRef.current = controlBytes;
      stdoutViewRef.current = stdoutView;
      stdoutBytesRef.current = stdoutBytes;

      const worker = new Worker('/worker.js', { type: 'module' });
      workerRef.current = worker;

      const ready = new Promise<void>((resolve, reject) => {
        let settled = false;

        const fail = (message: string) => {
          if (settled) return;
          settled = true;
          reject(new Error(message));
        };

        worker.onerror = (event) => {
          const message = event.message || 'worker crash';
          if (!settled) {
            fail(message);
            return;
          }
          stop();
          setStatus(`runtime error: ${message}`);
          writeTerm(`\r\n[worker] runtime error: ${message}\r\n`);
        };

        worker.onmessage = (event) => {
          const msg = event.data;

          if (msg?.type === 'ready') {
            if (!settled) {
              settled = true;
              resolve();
            }
            return;
          }

          if (msg?.type === 'error') {
            const message = msg.message || 'worker init failed';
            if (!settled) {
              fail(message);
              return;
            }
            stop();
            setStatus(`runtime error: ${message}`);
            writeTerm(`\r\n[worker] runtime error: ${message}\r\n`);
            return;
          }

          if (msg?.type === 'vfs_export' && exportWaiterRef.current) {
            const waiter = exportWaiterRef.current;
            exportWaiterRef.current = null;
            window.clearTimeout(waiter.timeoutId);
            waiter.resolve(msg.tarData ?? new ArrayBuffer(0));
            return;
          }

          if (msg?.type === 'vh-stage2-activated') {
            setStage2('active');
            setStatus('running (tier2)');
            return;
          }

          if (msg?.type === 'vh-stage2-error') {
            setStage2('error');
            setStatus(`running (stage2 error: ${msg.message || 'unknown'})`);
            return;
          }

          if (msg?.type === 'net_error') {
            writeTerm(`\r\n[net] ${msg.message || 'network lane error'}\r\n`);
            return;
          }

          if (msg?.type === 'exit') {
            const exitCodeRaw = msg.exitCode;
            const exitCode = Number.isFinite(exitCodeRaw) ? Number(exitCodeRaw) : 0;
            stop();
            setStatus(`exited (${exitCode})`);
            writeTerm(`\r\n[runtime] exited (${exitCode})\r\n`);
          }
        };
      });

      worker.postMessage({
        type: 'init',
        controlSab,
        stdoutSab,
        allowNetwork: profile.allowNetwork,
        ...TIER2_INIT_OPTIONS,
      });

      await ready;

      setStatus('loading assets');

      const [rootfsData, checkpointData] = await Promise.all([
        loadAsset(profile.rootfs, opfsCache),
        profile.checkpoint ? loadAsset(profile.checkpoint, opfsCache) : Promise.resolve(null),
      ]);

      if (opfsCache) {
        const overlay = await readOpfsFile('overlays', `${paneId}.overlay.tar`);
        if (overlay && overlay.byteLength > 0) {
          const payload = overlay.slice(0);
          worker.postMessage({ type: 'load_overlay', data: payload }, [payload]);
          setOpfsStatus(`opfs overlay loaded ${(overlay.byteLength / (1024 * 1024)).toFixed(1)} MB`);
        }
      }

      const envArgs = profile.env(keys).flatMap((entry) => ['--env', entry]);
      const args = [
        '--rootfs',
        '/rootfs.tar',
        ...envArgs,
        ...profile.entrypoint,
      ];

      if ((profile.id === 'gemini' || profile.id === 'codex') && isWrapperEntrypoint) {
        throw new Error(`wrapper entrypoint blocked for ${profile.id}; expected full CLI binary`);
      }

      const rootfsPayload = rootfsData.slice(0);
      const runMsg: Record<string, unknown> = {
        type: 'run',
        args,
        rootfsData: rootfsPayload,
      };
      const transfer: Transferable[] = [rootfsPayload];

      if (checkpointData) {
        const ckptPayload = checkpointData.slice(0);
        runMsg.checkpointData = ckptPayload;
        transfer.push(ckptPayload);
      }

      worker.postMessage(runMsg, transfer);

      stdoutPollRef.current = window.setInterval(() => {
        const view = stdoutViewRef.current;
        const bytes = stdoutBytesRef.current;
        if (!view || !bytes) return;

        const writeHead = Atomics.load(view, 0);
        let readTail = Atomics.load(view, 1);
        if (writeHead === readTail) return;

        let out = '';
        while (readTail !== writeHead) {
          out += String.fromCharCode(bytes[RING_HEADER + readTail]);
          readTail = (readTail + 1) % RING_SIZE;
        }
        Atomics.store(view, 1, readTail);

        const clean = sanitizeTerminalOutput(out, stdoutCarryRef, queueBytes);
        if (clean) writeTerm(clean);
        checkStdinRequest();
      }, 12);

      stdinPollRef.current = window.setInterval(checkStdinRequest, 12);

      setRunning(true);
      setStatus('running (activating tier2)');
      setStage2('activating');
      worker.postMessage({ type: 'activate-vh-stage2' });

      writeTerm(`\r\n[boot] ${profile.title} launched.\r\n`);
      writeTerm(`[boot] mode: ${isWrapperEntrypoint ? 'wrapper' : 'full-cli'}\r\n`);
      writeTerm(`[boot] entrypoint: ${profile.entrypoint.join(' ')}\r\n`);
      writeTerm(`[boot] checkpoint: ${checkpointData ? 'loaded' : 'none'}\r\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(`boot failed: ${message}`);
      writeTerm(`\r\n[boot] failed: ${message}\r\n`);
      stop();
    } finally {
      setBooting(false);
    }
  }, [booting, checkStdinRequest, isWrapperEntrypoint, isolatedReady, keys, opfsCache, paneId, profile, queueBytes, stop, term, writeTerm]);

  useEffect(() => {
    if (!term) return;

    writeTerm(`\r\n[${profile.id}] ready. press boot to start.\r\n`);

    const disposable = term.onData((data) => {
      let normalized = data;
      if (isWrapperLineMode) {
        if (data === '\r') {
          normalized = '\n';
          writeTerm('\r\n');
        } else if (/^[\x20-\x7E]+$/.test(data)) {
          writeTerm(data);
        }
      }
      queueInput(normalized);
    });

    return () => {
      disposable.dispose();
    };
  }, [isWrapperLineMode, profile.id, queueInput, term, writeTerm]);

  useEffect(() => {
    const w = window as StareTermWindow;
    if (!w.__stareTermDebug) w.__stareTermDebug = {};

    w.__stareTermDebug[paneId] = {
      getTranscript: () => outputRef.current,
      getBufferText: () => getTerminalBufferText(term),
      sendInput: (text: string) => queueInput(text),
      getStatus: () => status,
    };

    return () => {
      if (!w.__stareTermDebug) return;
      delete w.__stareTermDebug[paneId];
    };
  }, [paneId, queueInput, status, term]);

  useEffect(() => {
    if (bootVersion <= 0) return;
    if (lastHandledBootVersionRef.current === bootVersion) return;
    lastHandledBootVersionRef.current = bootVersion;
    void boot();
  }, [boot, bootVersion]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return (
    <section
      className={`group relative min-h-0 flex-1 overflow-hidden ${
        texturedFrame
          ? 'rounded-[14px] border border-white/[0.06] bg-[radial-gradient(120%_120%_at_0%_0%,rgba(255,255,255,0.05),rgba(255,255,255,0.015)_40%,rgba(255,255,255,0)_70%)] shadow-[0_22px_56px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(255,255,255,0.02)]'
          : 'bg-transparent'
      }`}
    >
      <div className="pointer-events-none absolute inset-x-2 top-2 z-20 flex items-start justify-between">
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-black/35 px-2 py-1 text-[10px] text-white/70 opacity-0 shadow-[0_10px_28px_rgba(0,0,0,0.45)] backdrop-blur-md transition-opacity duration-150 group-hover:opacity-100">
          <button
            type="button"
            onClick={() => void boot()}
            disabled={booting}
            className="rounded px-1.5 py-0.5 text-[10px] text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            {booting ? 'booting' : 'boot'}
          </button>
          <button
            type="button"
            onClick={stop}
            className="rounded px-1.5 py-0.5 text-[10px] text-white/70 hover:bg-white/10 hover:text-white"
          >
            stop
          </button>
          <button
            type="button"
            onClick={() => void saveOverlayToOpfs()}
            disabled={!running}
            className="rounded px-1.5 py-0.5 text-[10px] text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            opfs
          </button>
          {profile.quickCommands.map((cmd) => (
            <button
              key={cmd.label}
              type="button"
              onClick={() => queueInput(cmd.command)}
              disabled={!running}
              className="rounded px-1.5 py-0.5 text-[10px] text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              {cmd.label}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-white/10 bg-black/35 px-2 py-1 text-[10px] text-white/65 shadow-[0_10px_28px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <div className="flex items-center gap-2 uppercase tracking-[0.08em]">
            <span className={`h-1.5 w-1.5 rounded-full ${running ? 'bg-[#00ff9d]' : booting ? 'bg-yellow-400' : 'bg-red-500'}`} />
            <span>p{paneIndex + 1}</span>
            <span>{profile.id}</span>
            <span className="normal-case tracking-normal text-white/55">{status}</span>
            <span className="normal-case tracking-normal text-white/45">{stage2 === 'active' ? 'tier2' : stage2}</span>
            <span className="normal-case tracking-normal text-white/35">{opfsStatus}</span>
          </div>
        </div>
      </div>

      <div ref={containerRef} className="h-full min-h-0 w-full" />
    </section>
  );
}

export default function App() {
  const envKeys: KeyState = useMemo(
    () => ({
      anthropic:
        import.meta.env.ANTHROPIC_API_KEY ?? import.meta.env.VITE_ANTHROPIC_API_KEY ?? '',
      gemini:
        import.meta.env.GEMINI_API_KEY ?? import.meta.env.GOOGLE_API_KEY ?? import.meta.env.VITE_GEMINI_API_KEY ?? '',
      openai: import.meta.env.OPENAI_API_KEY ?? import.meta.env.VITE_OPENAI_API_KEY ?? '',
    }),
    [],
  );

  const automationConfig = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const automationRaw = (params.get("automation") || "").toLowerCase();
    const automationEnabled =
      automationRaw === "1" ||
      automationRaw === "true" ||
      automationRaw === "yes" ||
      params.has("automation");

    const presetParam = params.get("preset");
    const presetFromQuery = PRESETS.find((p) => p.id === presetParam)?.id || null;

    const autoBootRaw = (params.get("autoboot") || "").toLowerCase();
    const autoBoot = autoBootRaw === ""
      ? true
      : !(autoBootRaw === "0" || autoBootRaw === "false" || autoBootRaw === "no");

    return {
      automationEnabled,
      autoBoot,
      presetFromQuery,
    };
  }, []);

  const [keys, setKeys] = useState<KeyState>(envKeys);
  const [presetId, setPresetId] = useState('gemini-codex-duo');
  const [bootVersion, setBootVersion] = useState(0);
  const [opfsCache, setOpfsCache] = useState(true);
  const [isolatedReady, setIsolatedReady] = useState(false);
  const automationBootTriggeredRef = useRef(false);

  useEffect(() => {
    if (automationConfig.presetFromQuery) {
      setPresetId(automationConfig.presetFromQuery);
    }
  }, [automationConfig.presetFromQuery]);

  useEffect(() => {
    const w = window as StareTermWindow;
    w.__stareTermAutomationEnabled = automationConfig.automationEnabled;
  }, [automationConfig.automationEnabled]);

  useEffect(() => {
    if (!automationConfig.automationEnabled || !automationConfig.autoBoot) return;
    if (!isolatedReady) return;
    if (automationBootTriggeredRef.current) return;
    automationBootTriggeredRef.current = true;
    setBootVersion((v) => v + 1);
  }, [automationConfig.autoBoot, automationConfig.automationEnabled, isolatedReady]);

  useEffect(() => {
    setIsolatedReady(verifySystemIntegrity());
  }, []);

  const preset = useMemo(
    () => PRESETS.find((p) => p.id === presetId) ?? PRESETS[0],
    [presetId],
  );

  const panes = useMemo(
    () =>
      preset.slots.map((kind, i) => ({
        paneId: `${kind}-${i + 1}`,
        paneIndex: i,
        profile: PROFILES[kind],
      })),
    [preset],
  );

  const gridCols = panes.length >= 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-1';
  const texturedFrame = panes.length >= 3;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#060606] text-[#d4d4d4] font-mono">
      <header className="z-30 flex flex-wrap items-center gap-2 bg-black/35 px-3 py-2 text-[11px] text-white/70 shadow-[0_10px_36px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <span className={`h-2.5 w-2.5 rounded-full ${isolatedReady ? 'bg-[#00ff9d]' : 'bg-red-500'}`} />
        <span className="font-semibold">stare-term presets</span>
        <span className="opacity-70">{isolatedReady ? 'cross-origin isolated' : 'isolation missing'}</span>
        <span className={`rounded px-2 py-0.5 ${automationConfig.automationEnabled ? "bg-[#00ff9d]/20 text-[#8df7c5]" : "bg-white/10 text-white/70"}`}>
          {automationConfig.automationEnabled ? 'automation on' : 'automation off'}
        </span>

        <select
          value={presetId}
          onChange={(e) => setPresetId(e.target.value)}
          className="rounded border border-white/25 bg-black/40 px-2 py-1 text-xs"
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setBootVersion((v) => v + 1)}
          className="rounded border border-[#00ff9d]/50 px-3 py-1 text-xs hover:bg-[#00ff9d]/10"
        >
          boot preset
        </button>

        <label className="flex items-center gap-1 rounded border border-white/20 px-2 py-1">
          <input
            type="checkbox"
            checked={opfsCache}
            onChange={(e) => setOpfsCache(e.target.checked)}
          />
          <span>opfs asset cache</span>
        </label>

        <input
          type="password"
          value={keys.anthropic}
          onChange={(e) => setKeys((k) => ({ ...k, anthropic: e.target.value }))}
          placeholder="ANTHROPIC_API_KEY"
          className="w-[240px] rounded border border-white/20 bg-black/40 px-2 py-1 text-xs"
        />
        <input
          type="password"
          value={keys.gemini}
          onChange={(e) => setKeys((k) => ({ ...k, gemini: e.target.value }))}
          placeholder="GEMINI_API_KEY"
          className="w-[220px] rounded border border-white/20 bg-black/40 px-2 py-1 text-xs"
        />
        <input
          type="password"
          value={keys.openai}
          onChange={(e) => setKeys((k) => ({ ...k, openai: e.target.value }))}
          placeholder="OPENAI_API_KEY"
          className="w-[220px] rounded border border-white/20 bg-black/40 px-2 py-1 text-xs"
        />
      </header>

      <main className={`grid min-h-0 flex-1 grid-cols-1 gap-1 p-1.5 ${gridCols}`}>
        {panes.map((pane) => (
          <TerminalPane
            key={pane.paneId}
            paneId={pane.paneId}
            paneIndex={pane.paneIndex}
            texturedFrame={texturedFrame}
            profile={pane.profile}
            keys={keys}
            bootVersion={bootVersion}
            opfsCache={opfsCache}
            isolatedReady={isolatedReady}
          />
        ))}
      </main>
    </div>
  );
}
