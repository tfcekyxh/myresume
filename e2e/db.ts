import { PrismaClient } from '../server/src/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'
import { execFileSync } from 'node:child_process'
import { config } from 'dotenv'
import { resolve } from 'node:path'

/**
 * 测试专用数据库访问。
 *
 * 只用来构造/校验前置状态（照片会真实落库，且业务上没有删除照片的接口），
 * 不做接口级断言。测试从仓库根运行，cwd 下没有 .env，显式加载 server/.env。
 */
config({ path: resolve(process.cwd(), 'server/.env') })

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('缺少 DATABASE_URL，请检查 server/.env')
}

let client: PrismaClient | null = null

/** 惰性建连接。Prisma 7 运行时必须显式传 pg 驱动适配器。 */
function getPrisma(): PrismaClient {
  client ??= new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  return client
}

/** 测试结束调用，避免连接池让测试进程挂住。 */
export async function disconnectDb() {
  if (client) {
    await client.$disconnect()
    client = null
  }
}

/** 把简历的当前照片置空（photos 行保留，业务上只增不删）。 */
export async function clearResumePhoto(resumeId: string) {
  await getPrisma().resume.update({
    where: { id: resumeId },
    data: { photoId: null },
  })
}

/** 简历名下的 photos 行数。 */
export function countResumePhotos(resumeId: string) {
  return getPrisma().photo.count({ where: { resumeId } })
}

/** 删除简历名下的所有版本记录（photos 行保留，业务上没有删照片接口）。 */
export async function clearResumeVersions(resumeId: string) {
  await getPrisma().resumeVersion.deleteMany({ where: { resumeId } })
}

/** 简历名下的版本记录数。 */
export function countResumeVersions(resumeId: string) {
  return getPrisma().resumeVersion.count({ where: { resumeId } })
}

/**
 * 删除指定账号的全部简历（照片、版本记录随外键级联删除）。
 *
 * 多简历之后，用例需要一个干净起点：列表页可能残留上一个用例建的简历。
 * 只对专用测试账号调用——绝不能拿真实账号跑，否则会删掉真数据。
 */
export async function clearResumesForUser(username: string) {
  await getPrisma().resume.deleteMany({ where: { user: { username } } })
}

/**
 * 按用户名批量删除用户。
 *
 * 简历对用户是 onDelete: Cascade（照片、版本再随简历级联），
 * 所以删用户即可把该用户的全部数据清干净。
 * 供注册类用例清理临时注册的账号——只允许传本次测试创建的用户名。
 */
export async function deleteUsersByUsername(usernames: string[]) {
  if (usernames.length === 0) return
  await getPrisma().user.deleteMany({ where: { username: { in: usernames } } })
}

/**
 * 确保专用测试账号存在。
 *
 * 测试必须跑在自己的账号上：用例会清空该账号的简历，
 * 若复用真实账号会把用户自己的简历一起删掉。
 */
export async function ensureTestUser(username: string, password: string) {
  const prisma = getPrisma()

  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) return

  await prisma.user.create({
    data: { username, passwordHash: hashPassword(password) },
  })
}

/**
 * 用 Bun.password 生成 argon2id 哈希。
 *
 * Playwright 的 globalSetup 跑在 Node 进程里，没有 `Bun` 全局，
 * 所以借一个 bun 子进程来算，保证与 server 的校验方式一致。
 */
function hashPassword(password: string): string {
  const code = `process.stdout.write(await Bun.password.hash(${JSON.stringify(password)}))`
  return execFileSync('bun', ['-e', code], { encoding: 'utf8' }).trim()
}
