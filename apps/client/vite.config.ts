import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // /api в разработке уходит на локальный сервер (apps/server, порт 3000): клиент и API на одном адресе, CORS не нужен.
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://localhost:3000' } },
  preview: { port: 4173, strictPort: true },
  build: {
    // three.js сам по себе весит ~1 МБ.
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Библиотеки — отдельными файлами: они меняются редко, и после обновления приложения
        // браузер берёт их из кэша, а скачивает заново только наш код.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\/](three|three-stdlib|postprocessing|n8ao|@react-three|troika-[^\/]+|maath|camera-controls|meshline)[\/]/.test(id)) return 'three';
          if (/[\/](react|react-dom|scheduler|zustand|immer|use-sync-external-store)[\/]/.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
});
