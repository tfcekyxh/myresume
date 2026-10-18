import { defineConfig, devices } from '@playwright/test'
import {
  E2E_API_PORT,
  E2E_BASE_URL,
  E2E_CLIENT_PORT,
  E2E_DB_PATH,
  E2E_MAIL_API_URL,
  E2E_MAIL_BASE,
  E2E_MAIL_TO,
} from './e2e/env'

export default defineConfig({
  testDir: './e2e',
  // 测试跑在专用账号上，跑前确保它存在（同时会把库建好并补迁移）
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
    baseURL: E2E_BASE_URL,
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

  /**
   * 自己起一套前后端，跑在独立端口 + 独立库文件上（见 e2e/env.ts）。
   *
   * 刻意不复用已在跑的 dev：那套连的是主库，复用就等于测试打到你自己的数据上。
   * 代价是每次跑测试都要新起一套服务，换来的是可以边跑测试边开着 dev 改东西。
   * 顺带一提，库文件的建表与迁移由 globalSetup 载入服务端模块时自动完成。
   *
   * 这里是数组：前端服务之外还拉起一个假邮件服务（e2e/fake-mail-server.ts）。
   * 「发送到邮箱」只在配了 MAIL_API_KEY 时才走真实链路，所以把它指到假服务上；
   * 两者相互独立，谁先起来都不影响（被测服务只在真的发信时才访问它）。
   */
  webServer: [
    {
      command: 'bun e2e/fake-mail-server.ts',
      url: `${E2E_MAIL_BASE}/`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `VITE_PORT=${E2E_CLIENT_PORT} API_PORT=${E2E_API_PORT} PORT=${E2E_API_PORT} bun run dev`,
      url: E2E_BASE_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        SQLITE_PATH: E2E_DB_PATH,
        // 备份页只对 ADMIN_USERNAME 开放，测试里把它指到专用测试账号上，
        // 否则管理员相关的用例根本没法跑（见 e2e/admin-backup.spec.ts）。
        ADMIN_USERNAME: 'e2e-tester',
        // 把发信通道指到本地假服务，让「发送到邮箱」走真实链路而不是 503。
        // 副作用：每月备份邮件定时器也会跟着启用，30 秒后往同一地址发一封整库备份
        //（用例按 subject 过滤，不用总数断言）。MAIL_TO 生产上没有默认值，这里必须给。
        MAIL_API_URL: E2E_MAIL_API_URL,
        MAIL_API_KEY: 'e2e-fake-mail-key',
        MAIL_TO: E2E_MAIL_TO,
      },
    },
  ],
})
