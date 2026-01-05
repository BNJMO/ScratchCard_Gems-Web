import { defineConfig } from 'vite';
import { resolve } from 'path';
import buildConfig from './buildConfig.json' with { type: 'json' };

const basePath = buildConfig?.vite?.vitePath ?? '/Mines-Demo/';

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
    hmr: {
      overlay: true
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.svg', '**/*.webp', '**/*.wav', '**/*.mp3']
});
