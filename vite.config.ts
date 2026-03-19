import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  define: {
    'process.env': JSON.stringify({
      API_KEY: process.env.API_KEY || '',
      NODE_ENV: process.env.NODE_ENV || 'development'
    })
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
