import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { comlink } from 'vite-plugin-comlink';

export default defineConfig({
  plugins: [
    comlink(),
    tailwindcss(),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', { target: '19' }]]
      }
    })
  ],
  worker: {
    plugins: () => [comlink()],
    format: 'es'
  },
  build: {
    target: 'esnext',
    minify: 'oxc',
    cssMinify: 'lightningcss',
    assetsInlineLimit: 0,
    // Rolldown handles chunking via advancedGroups in 2026
    rolldownOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
        manualChunks: (id) => {
          if (id.includes('@xterm')) return 'terminal-ui';
          if (id.includes('node_modules/react')) return 'react-core';
          if (id.includes('src/engine')) return 'friscy-engine';
        }
      }
    }
  },
  server: {
    host: '127.0.0.1', // FORCE IPv4
    port: 8080,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
});
