import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import type { ITerminalOptions } from '@xterm/xterm';
import { useEffect, useMemo, useRef } from 'react';

import '@xterm/xterm/css/xterm.css';

const DEFAULT_TERMINAL_OPTIONS: ITerminalOptions = {
  allowProposedApi: true,
  cursorBlink: true,
  cursorStyle: 'bar',
  cursorWidth: 2,
  scrollback: 12000,
  minimumContrastRatio: 4.5,
  smoothScrollDuration: 80,
  drawBoldTextInBrightColors: true,
  fontFamily:
    '"JetBrains Mono", "IBM Plex Mono", "Cascadia Code", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: 15,
  fontWeight: '500',
  fontWeightBold: '700',
  letterSpacing: 0.2,
  lineHeight: 1.22,
  theme: {
    background: '#050607',
    foreground: '#e8edf2',
    cursor: '#94f7c5',
    cursorAccent: '#050607',
    selectionBackground: '#2e9eff55',
    selectionInactiveBackground: '#2e9eff33',
    black: '#1a1f24',
    red: '#ff5f73',
    green: '#4ee38c',
    yellow: '#ffd26e',
    blue: '#57a9ff',
    magenta: '#d18fff',
    cyan: '#4ce5ff',
    white: '#e8edf2',
    brightBlack: '#6a7480',
    brightRed: '#ff8b99',
    brightGreen: '#7cffb0',
    brightYellow: '#ffe59b',
    brightBlue: '#89c6ff',
    brightMagenta: '#e0b4ff',
    brightCyan: '#83f1ff',
    brightWhite: '#ffffff',
  },
};

export const useTerminal = (options: ITerminalOptions = {}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef(options);

  const term = useMemo(
    () =>
      new Terminal({
        ...DEFAULT_TERMINAL_OPTIONS,
        ...optionsRef.current,
      }),
    [],
  );

  const fitAddon = useMemo(() => new FitAddon(), []);

  useEffect(() => {
    if (!containerRef.current) return;

    term.open(containerRef.current);
    term.loadAddon(fitAddon);

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => fitAddon.fit());
    });

    resizeObserver.observe(containerRef.current);
    fitAddon.fit();

    if ('fonts' in document) {
      void document.fonts.ready.then(() => {
        requestAnimationFrame(() => fitAddon.fit());
      });
    }

    return () => {
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [fitAddon, term]);

  return { containerRef, term };
};
