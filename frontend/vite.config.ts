import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/auth/login': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/auth/callback': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/auth/me': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/auth/logout': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
