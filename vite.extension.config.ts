import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './extension/manifest.json' with { type: 'json' };

export default defineConfig(() => {
  return {
    root: 'extension',
    plugins: [react(), crx({ manifest })],
    build: {
      outDir: '../dist-extension',
      emptyOutDir: true,
    }
  };
});
