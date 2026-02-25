import { useWasmStore } from './store';

/**
 * ELITE_HARNESS: Verifies the 2GB stream arrived in the UI.
 * Directly taps the semantic buffer of the terminal instance.
 */
export const runHarnessTest = (term: any, targetPhrase: string) => {
  console.log(`%c─── HARNESS: SEARCHING_FOR_SINK: "${targetPhrase}"`, 'color: #d4d4d4;');

  const checkBuffer = () => {
    // Access the xterm.js active buffer memory
    const buffer = term.buffer.active;
    let content = '';

    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) content += line.translateToString();
    }

    if (content.includes(targetPhrase)) {
      console.log(`%c─── HARNESS_SUCCESS: "${targetPhrase}"_VERIFIED_IN_DOM`, 'color: #00ff9d;');
      return true;
    }
    return false;
  };

  // Poll for 10 seconds or until the WASM output arrives
  let attempts = 0;
  const interval = setInterval(() => {
    if (checkBuffer() || attempts > 100) {
      clearInterval(interval);
      if (attempts > 100) console.error('─── HARNESS_TIMEOUT: TARGET_NOT_FOUND');
    }
    attempts++;
  }, 100);
};
