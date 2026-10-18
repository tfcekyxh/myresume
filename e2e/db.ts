import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { E2E_DB_PATH } from './env'

/**
 * 测试专用数据库访问。
 *
 * 只用来构造/校验前置状态（照片会真实落库，且业务上没有删除照片的接口），
 * 不做接口级断言。
 *
 * 为什么不用服务端那套 drizzle + bun:sqlite：
 * Playwright 的 worker / globalSetup 跑在 **Node** 里——`bun run test:e2e` 只是用 bun
 * 起脚本，真正的 `playwright test` 由 shebang 交给 node 执行，因此既载不到 `bun:sqlite`，
 * 也解析不到只装在 server/node_modules 下的 drizzle-orm。所以这里直接用 Node 内置的
 * node:sqlite 打开同一个库文件，用原生 SQL 做少量 fixture 读写；表名/列名与
 * server/src/schema.ts 保持一致。
 *
 * 库路径由 ./env 钉死为 e2e/.db/e2e.sqlite（`process.env.SQLITE_PATH`），
 * 绝不会落到你自己的库里。测试从仓库根运行，库文件与表结构由 webServer 先起服务时建好。
 */

let database: DatabaseSync | null = null

/** 惰性开库，省掉每个函数都写一遍。 */
function db(): DatabaseSync {
  if (database) return database
  mkdirSync(dirname(E2E_DB_PATH), { recursive: true })
  database = new DatabaseSync(E2E_DB_PATH)
  // SQLite 默认不校验外键，简历/照片/版本的级联删除全靠这一行
  database.exec('PRAGMA foreign_keys = ON')
  // 与 server 的另一个连接并发写时，写操作自己排队
  database.exec('PRAGMA busy_timeout = 5000')
  return database
}

/** 测试结束调用，避免连接让测试进程挂住。 */
export function disconnectDb() {
  database?.close()
  database = null
}

/** 把简历的当前照片置空（photos 行保留，业务上只增不删）。 */
export function clearResumePhoto(resumeId: string) {
  db().prepare('UPDATE Resume SET photoId = NULL WHERE id = ?').run(resumeId)
}

/** 简历名下的 photos 行数。 */
export function countResumePhotos(resumeId: string): number {
  const row = db()
    .prepare('SELECT COUNT(*) AS n FROM Photo WHERE resumeId = ?')
    .get(resumeId) as { n: number }
  return row.n
}

/** 删除简历名下的所有版本记录（photos 行保留，业务上没有删照片接口）。 */
export function clearResumeVersions(resumeId: string) {
  db().prepare('DELETE FROM ResumeVersion WHERE resumeId = ?').run(resumeId)
}

/** 简历名下的版本记录数。 */
export function countResumeVersions(resumeId: string): number {
  const row = db()
    .prepare('SELECT COUNT(*) AS n FROM ResumeVersion WHERE resumeId = ?')
    .get(resumeId) as { n: number }
  return row.n
}

/**
 * 删除指定账号的全部简历（照片、版本记录随外键级联删除）。
 *
 * 多简历之后，用例需要一个干净起点：列表页可能残留上一个用例建的简历。
 * 只对专用测试账号调用——绝不能拿真实账号跑，否则会删掉真数据。
 */
export function clearResumesForUser(username: string) {
  const userId = findUserId(username)
  if (!userId) return

  db().prepare('DELETE FROM Resume WHERE userId = ?').run(userId)
}

function findUserId(username: string): string | undefined {
  const row = db()
    .prepare('SELECT id FROM User WHERE username = ? LIMIT 1')
    .get(username) as { id: string } | undefined

  return row?.id
}

/**
 * 按用户名批量删除用户。
 *
 * 简历对用户是 onDelete: Cascade（照片、版本再随简历级联），
 * 所以删用户即可把该用户的全部数据清干净。
 * 供注册类用例清理临时注册的账号——只允许传本次测试创建的用户名。
 */
export function deleteUsersByUsername(usernames: string[]) {
  if (usernames.length === 0) return
  const placeholders = usernames.map(() => '?').join(', ')
  db()
    .prepare(`DELETE FROM User WHERE username IN (${placeholders})`)
    .run(...usernames)
}

/**
 * 清空限流计数。
 *
 * 用例本身就要反复登录、注册，不清的话测试自己就会撞上生产阈值
 * （登录 15 分钟 10 次、注册 1 小时 2 次），跑到一半全变成 429。
 * 只影响限流表，与业务数据无关。
 */
export function clearRateLimits() {
  db().prepare('DELETE FROM RateLimit').run()
}

/**
 * 确保专用测试账号存在。
 *
 * 测试必须跑在自己的账号上：用例会清空该账号的简历，
 * 若复用真实账号会把用户自己的简历一起删掉。
 */
export function ensureTestUser(username: string, password: string) {
  if (findUserId(username)) return

  db()
    .prepare('INSERT INTO User (id, username, passwordHash, createdAt) VALUES (?, ?, ?, ?)')
    .run(crypto.randomUUID(), username, hashPassword(password), Date.now())
}

/**
 * 用 Bun.password 生成 argon2id 哈希。
 *
 * 测试进程是 Node，没有 `Bun` 全局，所以借一个 bun 子进程来算，
 * 保证与 server 的校验方式一致。
 */
function hashPassword(password: string): string {
  const code = `process.stdout.write(await Bun.password.hash(${JSON.stringify(password)}))`
  return execFileSync('bun', ['-e', code], { encoding: 'utf8' }).trim()
}
