import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// This configuration proxies requests starting with /api to the backend server.
// It solves CORS issues and works in both local and cloud-based environments.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
