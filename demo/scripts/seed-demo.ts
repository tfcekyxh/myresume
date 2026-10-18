import { chromium, request as playwrightRequest } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { demoResumeData, seededVersionSnapshot } from '../assets/demo-resume'
import {
  AUTH_STATE_PATH,
  BASE_URL,
  DEMO_DB_PATH,
  DEMO_PASSWORD,
  DEMO_RESUME_TITLE,
  DEMO_USERNAME,
  SEEDED_VERSION_NOTE,
} from './constants'
import { resolvePhotoBuffer } from './photo'

/**
 * 录制演示的基线数据。
 *
 * 同时被两处使用：
 * - demo/playwright.config.ts 的 globalSetup（录制开始前跑一次）
 * - `bun run demo:seed`（单独重录某条片段前手动跑）
 *
 * 会删掉 demo 账号下的全部简历（照片与版本随外键级联），
 * 所以用户名是硬编码常量，绝不从命令行读，也绝不指向真实账号。
 *
 * 库访问用 Node 内置的 node:sqlite，而不是服务端那套 drizzle + bun:sqlite：
 * 这个脚本有两条执行路径，globalSetup 那条跑在 **Node**（Playwright）里，
 * import 不到 bun:sqlite；node:sqlite 在 Bun 与 Node 下都可用。
 * 表名与列名对齐 server/src/schema.ts，日期列存毫秒数、JSON 列存 JSON 文本。
 */

/** 这些账号上的数据是别人的，误删后果严重，硬性拦住。 */
const FORBIDDEN_USERNAMES = ['e2e-tester', 'admin']

/**
 * 建库并补齐表结构。
 *
 * 录制时 Playwright 会先起 webServer（服务启动即自动迁移），这一步是冗余的；
 * 但单独跑 `bun run demo:seed` 时库里可能还什么都没有，所以这里补上。
 */
function ensureSchema() {
  execFileSync('bun', ['run', 'db:migrate'], {
    cwd: resolve(process.cwd(), 'server'),
    env: { ...process.env, SQLITE_PATH: DEMO_DB_PATH },
  })
}

function openDb() {
  const db = new DatabaseSync(DEMO_DB_PATH)
  // SQLite 默认不校验外键，级联删除全靠这一行
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  return db
}

function findUserId(db: DatabaseSync, username: string): string | undefined {
  const row = db.prepare('SELECT id FROM User WHERE username = ? LIMIT 1').get(username) as
    | { id: string }
    | undefined

  return row?.id
}

/**
 * 生成证件照素材的 base64。
 *
 * 占位图要现画，所以得起一个浏览器（复用系统 Chrome）。
 */
async function resolvePhotoBase64(): Promise<string> {
  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    const page = await browser.newPage()
    const buf = await resolvePhotoBuffer(page)
    return buf.toString('base64')
  } finally {
    await browser.close()
  }
}

/**
 * 走真实登录接口拿一份 storageState，供片段 2/3/4 免登录开场。
 *
 * 需要 dev server 已在跑。单独执行 `bun run demo:seed` 而服务没起时会跳过，
 * 录制时 Playwright 的 webServer 已就绪，globalSetup 会补上。
 */
async function writeAuthState(): Promise<void> {
  const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
  try {
    const res = await ctx.post('/api/auth/login', {
      data: { username: DEMO_USERNAME, password: DEMO_PASSWORD },
    })
    if (!res.ok()) {
      throw new Error(`登录失败：${res.status()} ${await res.text()}`)
    }
    await mkdir(dirname(AUTH_STATE_PATH), { recursive: true })
    await ctx.storageState({ path: AUTH_STATE_PATH })
    console.log(`[demo:seed] 已写入免登录状态 ${AUTH_STATE_PATH}`)
  } catch (err) {
    console.warn(
      `[demo:seed] 跳过写 storageState（${(err as Error).message}）。` +
        `单独跑 seed 需要先启动 bun run dev；录制时会自动补上。`
    )
  } finally {
    await ctx.dispose()
  }
}

/**
 * 生成与 server 校验方式一致的 argon2id 哈希。
 *
 * 这个脚本有两条执行路径：`bun run demo:seed` 直接跑，以及被 Playwright
 * 的 globalSetup 加载（那是 Node 进程，没有 `Bun` 全局）。为免两条路径
 * 不一致，统一借一个 bun 子进程来算 —— 与 e2e/db.ts 的做法相同。
 */
function hashPassword(password: string): string {
  const code = `process.stdout.write(await Bun.password.hash(${JSON.stringify(password)}))`
  return execFileSync('bun', ['-e', code], { encoding: 'utf8' }).trim()
}

/**
 * 录视频依赖 Playwright 自带的那份 ffmpeg，没装的话录制会在第一条
 * 片段上直接报错，所以在这里提前拦住并给出安装命令。
 */
function assertRecordingFfmpeg() {
  const cacheDir = resolve(homedir(), 'Library/Caches/ms-playwright')
  const found =
    existsSync(cacheDir) && readdirSync(cacheDir).some((name) => name.startsWith('ffmpeg-'))
  if (!found) {
    throw new Error(
      '缺少 Playwright 自带的 ffmpeg（录制视频必需），先执行：bunx playwright install ffmpeg'
    )
  }
}

async function seedDemo(): Promise<void> {
  assertRecordingFfmpeg()

  if (FORBIDDEN_USERNAMES.includes(DEMO_USERNAME)) {
    throw new Error(`演示账号不能是 ${DEMO_USERNAME}，这个脚本会删掉它名下的全部简历`)
  }

  // constants.ts 已把 SQLITE_PATH 钉到 demo 专用库上（与主库、e2e 的库都隔离）
  ensureSchema()

  const db = openDb()
  try {
    // 每次重置密码，免得改过密码之后录制登不进去
    const passwordHash = hashPassword(DEMO_PASSWORD)
    let userId = findUserId(db, DEMO_USERNAME)

    if (userId) {
      db.prepare('UPDATE User SET passwordHash = ? WHERE id = ?').run(passwordHash, userId)
    } else {
      userId = crypto.randomUUID()
      db.prepare(
        'INSERT INTO User (id, username, passwordHash, createdAt) VALUES (?, ?, ?, ?)'
      ).run(userId, DEMO_USERNAME, passwordHash, Date.now())
    }

    // 只动这个账号名下的数据
    db.prepare('DELETE FROM Resume WHERE userId = ?').run(userId)

    const resumeId = crypto.randomUUID()
    db.prepare(
      'INSERT INTO Resume (id, userId, title, data, updatedAt) VALUES (?, ?, ?, ?, ?)'
    ).run(resumeId, userId, DEMO_RESUME_TITLE, JSON.stringify(demoResumeData), Date.now())

    // 照片只挂在预置的历史版本上，当前草稿保持「未上传」——
    // 片段 2 才有「选择照片 → 预览出现」这个过程可录。
    const photoId = crypto.randomUUID()
    db.prepare('INSERT INTO Photo (id, resumeId, data, createdAt) VALUES (?, ?, ?, ?)').run(
      photoId,
      resumeId,
      await resolvePhotoBase64(),
      Date.now()
    )

    // 不写 lastArchivedAt：草稿与这份旧快照不一致，列表首条应显示「未存档」
    db.prepare(
      'INSERT INTO ResumeVersion (id, resumeId, snapshot, photoId, note, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      crypto.randomUUID(),
      resumeId,
      JSON.stringify(seededVersionSnapshot),
      photoId,
      SEEDED_VERSION_NOTE,
      Date.now()
    )

    console.log(
      `[demo:seed] 账号 ${DEMO_USERNAME} / 简历 ${resumeId}「${DEMO_RESUME_TITLE}」已就绪`
    )
  } finally {
    db.close()
  }

  await writeAuthState()
}

export default seedDemo
