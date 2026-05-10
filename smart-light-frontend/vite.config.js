import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Semua request ke /api/* akan diforward ke Laravel backend
      '/api': {
        target: 'http://192.168.100.36:8000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
