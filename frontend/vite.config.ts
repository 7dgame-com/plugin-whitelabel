import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

function buildVersion(): string {
  const now = new Date()
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  const year = beijing.getUTCFullYear()
  const month = String(beijing.getUTCMonth() + 1).padStart(2, '0')
  const day = String(beijing.getUTCDate()).padStart(2, '0')
  const hour = String(beijing.getUTCHours()).padStart(2, '0')
  const minute = String(beijing.getUTCMinutes()).padStart(2, '0')
  return `${year}.${month}.${day}-${hour}${minute}`
}

export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion()),
  },
  server: {
    port: 3012,
    proxy: {
      '/backend/api/': {
        target: process.env.VITE_APP_BACKEND_URL || 'http://localhost:8093',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/backend/, ''),
      },
      '/api/': {
        target: process.env.VITE_APP_API_URL || 'http://localhost:8081',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    clearMocks: true,
  },
})
