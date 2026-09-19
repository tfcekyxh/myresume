import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  // 所有用例共用预置账号的同一份简历草稿，并发会互相覆盖，故串行执行
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      // 复用系统已安装的 Chrome，避免额外下载 Playwright 自带浏览器
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],

  // 本地已启动 dev 时直接复用；否则自动启动前后端
  webServer: {
    command: 'bun run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
