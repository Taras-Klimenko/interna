import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // /api в разработке уходит на локальный сервер (apps/server, порт 3000): клиент и API на одном адресе, CORS не нужен.
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://localhost:3000' } },
  preview: { port: 4173, strictPort: true },
  // three.js сам по себе весит ~1 МБ; делить бандл имеет смысл позже, когда появятся отдельные экраны.
  build: { chunkSizeWarningLimit: 1600 },
});
