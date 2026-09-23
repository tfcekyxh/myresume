import type { RequestHandler } from 'express'
import { prisma } from './db'

/**
 * 基于 Postgres 的固定窗口限流。
 *
 * 计数落在 RateLimit 表（复合主键 key + windowStart），「加一」由一条 UPSERT 完成，
 * 因此多实例部署时各实例共享同一份计数——这是选数据库而非进程内 Map 的原因。
 *
 * 代价是每个受限请求多一次数据库写。所以只给真正需要的接口挂：
 * 认证类（防爆破）、大模型解析（真金白银）、导出（CPU 密集），以及一个宽松的全局兜底。
 */

type RateLimitOptions = {
  /** 窗口长度（毫秒） */
  windowMs: number
  /** 窗口内允许的请求数 */
  max: number
  /** 计数维度：ip 用于还没有身份的接口，user 用于已登录用户 */
  scope: 'ip' | 'user'
  /** 超限提示，走与其他接口一致的 { error } 结构，前端直接展示 */
  message: string
}

/**
 * 限流器只用到 req.ip 与 req.session，不碰路由参数。
 *
 * params 泛型必须是 any：写成具体的宽类型会让 Express 5 反过来用它推断路由参数，
 * 把 /:id/export/docx 的 req.params.id 撑成 string | string[]，破坏下游的类型。
 */
export function rateLimit(
  name: string,
  { windowMs, max, scope, message }: RateLimitOptions,
): RequestHandler<any> {
  return async function rateLimitMiddleware(req, res, next) {
    // 用户维度挂在 requireAuth 之后，取不到身份说明没登录，交给下游的 401
    const identity = scope === 'user' ? req.session.userId : req.ip
    if (!identity) return next()

    const now = Date.now()
    // 窗口起点对齐，让同一窗口内的请求落在同一行上
    const windowStart = new Date(now - (now % windowMs))

    let count: number
    try {
      count = await bump(`${name}:${scope}:${identity}`, windowStart)
    } catch (error) {
      // 计数失败不拖垮业务：数据库不可用时接口本身也活不成，这里放行并留下日志
      console.error(`[rate-limit] ${name} 计数失败，本次放行:`, error)
      return next()
    }

    if (count > max) {
      // 告诉客户端还要等多久，而不是让它盲试
      res.setHeader(
        'Retry-After',
        String(Math.ceil((windowStart.getTime() + windowMs - now) / 1000)),
      )
      res.status(429).json({ error: message })
      return
    }

    next()
  }
}

/** 给某个 key 在当前窗口计数加一并返回加完后的值。 */
async function bump(key: string, windowStart: Date): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count")
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key", "windowStart")
    DO UPDATE SET "count" = "RateLimit"."count" + 1
    RETURNING "count"
  `

  // 清理是顺带的，不参与本次限流判断
  void cleanupStale()

  return Number(rows[0]?.count ?? 1)
}

/** 过期行清理的触发概率：低频即可，否则每次请求都要多一次 DELETE。 */
const CLEANUP_PROBABILITY = 0.01
/** 超过这个时长没被碰过的窗口行视为垃圾。取 24 小时，远大于所有窗口长度。 */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000

function cleanupStale() {
  if (Math.random() > CLEANUP_PROBABILITY) return

  prisma
    .$executeRaw`DELETE FROM "RateLimit" WHERE "windowStart" < ${new Date(Date.now() - STALE_AFTER_MS)}`
    .catch((error) => console.error('[rate-limit] 清理过期计数失败:', error))
}