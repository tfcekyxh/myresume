import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // xfwd 让代理带上 X-Forwarded-Host（5173），否则 changeOrigin 改写后的 Host
      // 是 3000，与浏览器的 Origin 对不上，会被后端的 CSRF 同源校验拒掉。
      '/api': { target: 'http://localhost:3000', changeOrigin: true, xfwd: true },
    },
  },
})
