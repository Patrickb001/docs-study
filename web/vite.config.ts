import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Opens the app in your browser when you run "npm run dev".
  server: { port: 5173, host: '127.0.0.1', open: true },
  build: { chunkSizeWarningLimit: 2000 },
});
