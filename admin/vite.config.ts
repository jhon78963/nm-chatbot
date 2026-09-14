import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Local backend default; override in .env.development.local (e.g. https://admision.uprit.edu.pe)
  const apiProxy = env.VITE_DEV_API_PROXY || 'http://localhost:8090'

  return {
    plugins: [react()],
    base: env.VITE_BASE_PATH || '/',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiProxy,
          changeOrigin: true,
          ws: true,
        },
        '/media': {
          target: apiProxy,
          changeOrigin: true,
        },
      },
    },
  }
})
