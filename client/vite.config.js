import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy /api and /health to the backend so the browser talks to one origin.
    proxy: {
      '/api': 'http://localhost:5000',
      '/health': 'http://localhost:5000',
    },
  },
});
