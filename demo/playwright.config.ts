import { defineConfig, devices } from '@playwright/test'
import {
  AUTH_STATE_PATH,
  BASE_URL,
  DEMO_API_PORT,
  DEMO_CLIENT_PORT,
  DEMO_DB_PATH,
  RAW_DIR,
  VIEWPORT,
} from './scripts/constants'

/**
 * 演示动图录制的独立配置。
 *
 * 与 e2e 彻底隔离：这里的 testDir 是 demo/scripts，根配置是 ./e2e，
 * 所以 `bun run test:e2e` 永远看不到这些用例。
 *
 * 一个 test = 一个 context = 一条 webm，四个片段天然就是四个独立文件。
 */
export default defineConfig({
  testDir: './scripts',
  outputDir: RAW_DIR,
  globalSetup: './scripts/seed-demo.ts',

  // 片段之间共用 demo 账号的数据（按 01→04 顺序演进），必须串行
  workers: 1,
  fullyParallel: false,
  // 重试会再花一次真实模型调用，还会留下多份视频，故不重试
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 15_000 },
  reporter: 'list',

  use: {
    baseURL: BASE_URL,
    // 免登录：session 存在数据库里，cookie 可跨 context 复用。
    // 片段 2/3/4 直接用这份 state 开场，视频第一帧就是页面加载而不是空屏。
    storageState: AUTH_STATE_PATH,
    // 这两个尺寸必须一致，否则录出来的画面会被缩放、文字发虚
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    // 这里刻意不配 use.video：录制改由各条 spec 用 page.screencast 显式开关
    // （见 demo-utils 的 startClip），这样准备步骤与开场白屏不会进视频，
    // 也避开了 use.video 给每个动作加的高亮延迟。
    actionTimeout: 20_000,
    trace: 'off',
  },

  projects: [
    {
      name: 'demo',
      // 复用系统已安装的 Chrome，与 e2e 保持一致
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        // 必须写在 devices 展开之后：Desktop Chrome 自带 1280×720 的 viewport，
        // 与录制的 size 对不上时，画面会被缩放并在底部留一条灰边
        viewport: VIEWPORT,
        deviceScaleFactor: 1,
      },
    },
  ],

  /**
   * 自己起一套前后端，跑在独立端口 + 独立库文件上（见 scripts/constants.ts）。
   * 刻意不复用已在跑的 dev：那套连的是主库，而录制会反复删改 demo 账号的数据。
   * 库文件的建表与迁移由 globalSetup 载入服务端模块时自动完成。
   */
  webServer: {
    command: `VITE_PORT=${DEMO_CLIENT_PORT} API_PORT=${DEMO_API_PORT} PORT=${DEMO_API_PORT} bun run dev`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { SQLITE_PATH: DEMO_DB_PATH },
  },
})