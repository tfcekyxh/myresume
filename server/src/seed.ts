import { eq } from 'drizzle-orm'
import { RESUME_MODULE_ORDER } from '@mymenu/shared'
import { db } from './db'
import { users } from './schema'

/**
 * 预置登录账号。
 *
 * 按用户名幂等 upsert 且会更新密码，所以**不要**放进部署流程：
 * 那等于每次部署都把密码重置回命令行给的值。部署后手工跑一次即可。
 *
 * 用法：bun run db:seed -- -u <用户名> -p <密码>（或设置 SEED_PASSWORD）
 */

// 从命令行读取 -u/-p，缺省用环境变量
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const username = arg('-u') ?? process.env.SEED_USERNAME ?? 'admin'
const password = arg('-p') ?? process.env.SEED_PASSWORD

if (!password) {
  throw new Error('必须提供密码：bun run db:seed -- -u <用户> -p <密码>，或设置 SEED_PASSWORD')
}

const passwordHash = await Bun.password.hash(password)

const [existing] = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.username, username))
  .limit(1)

if (existing) {
  await db.update(users).set({ passwordHash }).where(eq(users.id, existing.id))
  console.log(`账号 ${username} 已存在，已更新密码`)
} else {
  await db.insert(users).values({ username, passwordHash })
  console.log(`已创建账号 ${username}`)
}

console.log('模块顺序:', RESUME_MODULE_ORDER.join(' / '))
process.exit(0)
