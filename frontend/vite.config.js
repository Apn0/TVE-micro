// file: frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite dev server with working proxy to Flask backend on :5000
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',          // reachable from LAN / other machines
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      }
    }
  }
})

