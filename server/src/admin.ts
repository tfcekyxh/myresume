import type { NextFunction, Request, Response } from 'express'
import { eq } from 'drizzle-orm'
import { db } from './db'
import { ADMIN_USERNAME } from './env'
import { users } from './schema'

/**
 * 环境变量指定的唯一管理员。
 *
 * 没有引入角色表：单机自部署就是一个人用，一个环境变量足够，
 * 也省掉一次迁移与一套授权界面。留空表示没人有权限——宁可功能不可用，
 * 也不能在没配的情况下把「整库替换」的口子开着。
 */
export function isAdminUsername(username: string | null | undefined): boolean {
  return ADMIN_USERNAME !== '' && username === ADMIN_USERNAME
}

/** 按会话里的 userId 取用户名；用户已被删则返回 null。 */
export async function currentUsername(userId: string): Promise<string | null> {
  const [user] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  return user?.username ?? null
}

/** 备份导出 / 导入的鉴权：只有管理员能碰，需先过 requireAuth。 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const username = req.session.userId ? await currentUsername(req.session.userId) : null

  if (!isAdminUsername(username)) {
    res.status(403).json({ error: '只有管理员可以操作数据备份' })
    return
  }

  next()
}
