import { chromium, request as playwrightRequest } from '@playwright/test'
import { PrismaPg } from '@prisma/adapter-pg'
import { config } from 'dotenv'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { PrismaClient } from '../../server/src/generated/prisma'
import { demoResumeData, seededVersionSnapshot } from '../assets/demo-resume'
import {
  AUTH_STATE_PATH,
  BASE_URL,
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
 */

config({ path: resolve(process.cwd(), 'server/.env') })

/** 这些账号上的数据是别人的，误删后果严重，硬性拦住。 */
const FORBIDDEN_USERNAMES = ['e2e-tester', 'admin']

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('缺少 DATABASE_URL，请检查 server/.env')
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

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  try {
    // 每次重置密码，免得改过密码之后录制登不进去
    const passwordHash = hashPassword(DEMO_PASSWORD)
    const user = await prisma.user.upsert({
      where: { username: DEMO_USERNAME },
      update: { passwordHash },
      create: { username: DEMO_USERNAME, passwordHash },
    })

    // 只动这个账号名下的数据
    await prisma.resume.deleteMany({ where: { userId: user.id } })

    const resume = await prisma.resume.create({
      data: {
        userId: user.id,
        title: DEMO_RESUME_TITLE,
        data: demoResumeData,
      },
    })

    // 照片只挂在预置的历史版本上，当前草稿保持「未上传」——
    // 片段 2 才有「选择照片 → 预览出现」这个过程可录。
    const photo = await prisma.photo.create({
      data: { resumeId: resume.id, data: await resolvePhotoBase64() },
    })

    // 不写 lastArchivedAt：草稿与这份旧快照不一致，列表首条应显示「未存档」
    await prisma.resumeVersion.create({
      data: {
        resumeId: resume.id,
        snapshot: seededVersionSnapshot,
        photoId: photo.id,
        note: SEEDED_VERSION_NOTE,
      },
    })

    console.log(
      `[demo:seed] 账号 ${DEMO_USERNAME} / 简历 ${resume.id}「${DEMO_RESUME_TITLE}」已就绪`
    )
  } finally {
    await prisma.$disconnect()
  }

  await writeAuthState()
}

export default seedDemo