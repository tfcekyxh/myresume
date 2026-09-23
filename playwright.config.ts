import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  // 测试跑在专用账号上，跑前确保它存在
  globalSetup: './e2e/global-setup.ts',
  // 所有用例共用同一个测试账号的简历，并发会互相覆盖，故串行执行
  workers: 1,
  reporter: 'list',

  // 单个用例总超时。默认 30s 对 AI 解析类步骤偏紧，放宽到 3 分钟；
  // 常规用例不受影响，断言等待单独由 expect.timeout 控制。
  timeout: 180_000,

  expect: {
    // 自动等待类断言（toBeVisible 等）的超时，默认 5s，放宽到 15s
    timeout: 15_000,
  },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // click / fill 等动作的自动等待超时，默认 0（跟随用例总超时）
    actionTimeout: 15_000,
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
