import { resolve } from 'node:path'

/**
 * 演示动图录制的公共常量。
 *
 * 所有 demo 脚本一律从仓库根执行（npm scripts 就是这么定义的），
 * 与 e2e/db.ts 读 server/.env 时的假设保持一致。
 */
const ROOT = process.cwd()

export const DEMO_DIR = resolve(ROOT, 'demo')
export const SCRIPTS_DIR = resolve(DEMO_DIR, 'scripts')
export const ASSETS_DIR = resolve(DEMO_DIR, 'assets')

/** 中间产物与成品，已 gitignore。 */
export const OUTPUT_DIR = resolve(DEMO_DIR, 'output')
/** 原始 webm */
export const RAW_DIR = resolve(OUTPUT_DIR, 'raw')
/** 转码后的 GIF / MP4 */
export const CLIPS_DIR = resolve(OUTPUT_DIR, 'clips')
/** 片段 4 导出的 docx / pdf 落盘处 */
export const DOWNLOADS_DIR = resolve(OUTPUT_DIR, 'downloads')

/** 免登录用的 storageState，已 gitignore。 */
export const AUTH_STATE_PATH = resolve(DEMO_DIR, '.auth/state.json')

/** 演示录制专用的库文件，与主库、e2e 的库都隔离。 */
export const DEMO_DB_PATH = resolve(DEMO_DIR, '.db/demo.sqlite')

/**
 * 演示脚本一律跑在独立库上。
 *
 * 这里**覆盖**而不是兜底：录制会反复清空 demo 账号、重建简历，
 * shell 里正好设过 SQLITE_PATH 也不能让它落到自己的库上。
 * 用副作用（而非让每个入口各设一次）是为了让 playwright.config 里的
 * webServer 子进程也继承到同一个路径。
 */
process.env.SQLITE_PATH = DEMO_DB_PATH

/** 可选的自备证件照；存在则优先使用，否则脚本现场生成一张占位图。 */
export const PROVIDED_PHOTO_PATH = resolve(ASSETS_DIR, 'photo.jpg')

/**
 * 演示专用账号。
 *
 * 这个账号下的简历会被 seed 脚本反复清空重建，所以**绝不能**指向
 * e2e-tester（e2e 会清它）或任何真实账号。
 */
export const DEMO_USERNAME = 'demo'
export const DEMO_PASSWORD = 'demo-demo'

export const DEMO_RESUME_TITLE = '张伟的简历（前端工程师）'

/** 预置的历史版本备注，让片段 4 的版本列表不是空的。 */
export const SEEDED_VERSION_NOTE = '投递前端岗'

/** 演示录制用的端口，与 dev（5173 + 3000）、e2e（5200 + 3100）都错开。 */
export const DEMO_CLIENT_PORT = Number(process.env.DEMO_CLIENT_PORT ?? 5300)
export const DEMO_API_PORT = Number(process.env.DEMO_API_PORT ?? 3200)

export const BASE_URL = `http://localhost:${DEMO_CLIENT_PORT}`

/** 录制视口。必须与 playwright.config.ts 里的 video.size 一致，否则画面会被缩放发虚。 */
export const VIEWPORT = { width: 1200, height: 800 }