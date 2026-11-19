import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  // three.js сам по себе весит ~1 МБ; делить бандл имеет смысл позже, когда появятся отдельные экраны.
  build: { chunkSizeWarningLimit: 1600 },
});
