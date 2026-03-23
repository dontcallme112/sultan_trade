import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',

  server: {
    port: 5173,
    open: true,
    // Proxy — локально запросы /api/* уходят на Railway
    // На проде (Vercel) этот блок не работает — там BACKEND_URL из .env
    proxy: {
      '/api': {
        target: 'https://sultantrade-production.up.railway.app',
        changeOrigin: true,
        secure: true,
      }
    }
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('react-dom'))     return 'react-dom'
          if (id.includes('react-router'))  return 'router'
          if (id.includes('react'))         return 'react'
          if (id.includes('lucide') || id.includes('heroicons')) return 'icons'
          if (id.includes('node_modules'))  return 'vendor'
        },
      },
    },
  },

  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
})