import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * 端口可由环境变量覆盖：e2e 与演示录制各自起一套前后端，
 * 与你自己在跑的 dev（5173 + 3000）错开，互不抢端口也不抢数据。
 */
const clientPort = Number(process.env.VITE_PORT ?? 5173)
const apiPort = Number(process.env.API_PORT ?? 3000)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: clientPort,
    proxy: {
      // xfwd 让代理带上 X-Forwarded-Host（前端端口），否则 changeOrigin 改写后的 Host
      // 是后端端口，与浏览器的 Origin 对不上，会被后端的 CSRF 同源校验拒掉。
      '/api': { target: `http://localhost:${apiPort}`, changeOrigin: true, xfwd: true },
    },
  },
})
