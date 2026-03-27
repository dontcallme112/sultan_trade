import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',

  server: {
    port: 5173,
    open: true,
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
    // Уменьшаем размер бандла
    target: 'es2015',
    cssMinify: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Разбиваем на чанки — браузер кеширует отдельно
        manualChunks(id) {
          if (id.includes('react-dom'))    return 'react-dom'
          if (id.includes('react-router')) return 'router'
          if (id.includes('react'))        return 'react'
          if (id.includes('@supabase'))    return 'supabase'
          if (id.includes('node_modules')) return 'vendor'
        },
        // Имена с хешем для долгого кеширования
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },

  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
})