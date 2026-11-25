import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        home: resolve(import.meta.dirname, 'home.html'),
        board: resolve(import.meta.dirname, 'board.html'),
        landing: resolve(import.meta.dirname, 'landing.html'),
        community: resolve(import.meta.dirname, 'community.html'),
        tool: resolve(import.meta.dirname, 'tool.html'),
        photoframe: resolve(import.meta.dirname, 'photoframe/index.html')
      }
    }
  },
  server: {
    port: 5173,
    open: false,
    host: true
  }
});
