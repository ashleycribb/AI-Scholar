import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/s2': {
            target: 'https://api.semanticscholar.org/graph/v1',
            changeOrigin: true,
            rewrite: (p) => p.replace(/^\/api\/s2/, ''),
            headers: {
              'User-Agent': 'AI-Research-Explorer/1.0'
            }
          }
        }
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(process.cwd(), '.'),
        }
      },
      build: {
        rollupOptions: {
          external: [/^https?:\/\//],
          onwarn(warning, warn) {
            if (
              warning.code === 'MISSING_EXPORT' ||
              (typeof warning.message === 'string' && warning.message.includes('is not exported'))
            ) {
              throw new Error(warning.message);
            }
            warn(warning);
          }
        }
      }
    };
});
