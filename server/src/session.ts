import { eq, sql } from 'drizzle-orm'
import session from 'express-session'
import type { Store } from 'express-session'
import { db } from './db'
import { IS_PRODUCTION, SESSION_SECRET } from './env'
import { sessions } from './schema'

declare module 'express-session' {
  interface SessionData {
    userId: string
  }
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

export const SESSION_COOKIE_NAME = 'connect.sid'

/** 会话行上的过期时间：优先后取 cookie 自己的 expires，拿不到就按 30 天算。 */
function expireAt(sess: session.SessionData): Date {
  const expires = sess.cookie?.expires
  if (expires) return new Date(expires)

  const maxAge = sess.cookie?.maxAge
  return new Date(Date.now() + (typeof maxAge === 'number' ? maxAge : THIRTY_DAYS))
}

/**
 * 会话落在同一个 SQLite 库里（原来是 connect-pg-simple 建的表）。
 *
 * 自己实现而不是再引一个 store 包：库里只有一份数据文件，结构由 schema.ts 管，
 * 备份导出时会话也跟着一起走，不需要第二个存储载体。
 */
class SqliteSessionStore extends session.Store {
  async get(sid: string, callback: (err: unknown, sess?: session.SessionData | null) => void) {
    try {
      const [row] = await db.select().from(sessions).where(eq(sessions.sid, sid)).limit(1)
      if (!row) return callback(null, null)

      // 过期行当作不存在，顺手删掉
      if (+row.expire <= Date.now()) {
        await this.drop(sid)
        return callback(null, null)
      }

      callback(null, row.sess as unknown as session.SessionData)
    } catch (err) {
      callback(err)
    }
  }

  async set(sid: string, sess: session.SessionData, callback?: (err?: unknown) => void) {
    try {
      await this.put(sid, sess)
      callback?.()
    } catch (err) {
      callback?.(err)
    }
  }

  async destroy(sid: string, callback?: (err?: unknown) => void) {
    try {
      await this.drop(sid)
      callback?.()
    } catch (err) {
      callback?.(err)
    }
  }

  /**
   * 每次请求续期时只改 expire，不重写整份会话数据。
   * 写失败不影响本次请求，只留一条日志——过期时间没续上，下次请求还能再续。
   */
  async touch(sid: string, sess: session.SessionData, callback?: () => void) {
    try {
      await db.update(sessions).set({ expire: expireAt(sess) }).where(eq(sessions.sid, sid))
    } catch (err) {
      console.error('[session] 续期失败:', err)
    }
    callback?.()
  }

  private drop(sid: string) {
    return db.delete(sessions).where(eq(sessions.sid, sid))
  }

  private async put(sid: string, sess: session.SessionData) {
    const row = {
      sid,
      sess: sess as unknown as Record<string, unknown>,
      expire: expireAt(sess),
    }

    await db
      .insert(sessions)
      .values(row)
      .onConflictDoUpdate({ target: sessions.sid, set: { sess: row.sess, expire: row.expire } })

    cleanupStale()
  }
}

/** 过期会话清理的触发概率：低频即可，否则每个请求都要多一次 DELETE。 */
const CLEANUP_PROBABILITY = 0.01

function cleanupStale() {
  if (Math.random() > CLEANUP_PROBABILITY) return

  // bun:sqlite 是同步驱动，db.run 直接返回 void，失败要自己 try/catch。
  // 另外必须绑毫秒数而不是 Date：原生 SQL 里绑 Date 的比较会静默失效。
  try {
    db.run(sql`DELETE FROM "Session" WHERE "expire" < ${Date.now()}`)
  } catch (error) {
    console.error('[session] 清理过期会话失败:', error)
  }
}

export const sessionMiddleware = session({
  store: new SqliteSessionStore() as Store,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  // 每次请求都续期，避免隔几天不登录就被登出
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    // 生产环境走 https 才允许携带，本地 http 必须关掉
    secure: IS_PRODUCTION,
    maxAge: THIRTY_DAYS,
  },
})
