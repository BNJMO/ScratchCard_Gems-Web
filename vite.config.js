import { defineConfig } from 'vite';
import { resolve } from 'path';
import config from './src/config.json' assert { type: 'json' };

const basePath =
  typeof config?.vitePath === 'string' && config.vitePath.trim()
    ? config.vitePath
    : '/';

export default defineConfig({
  base: basePath,
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});

