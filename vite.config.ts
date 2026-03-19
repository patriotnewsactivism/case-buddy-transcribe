import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // This allows the process.env usage in your code to work after build
    'process.env': JSON.stringify({
      API_KEY: process.env.API_KEY || '',
      NODE_ENV: process.env.NODE_ENV || 'development'
    })
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});    sourcemap: false
  }
});
