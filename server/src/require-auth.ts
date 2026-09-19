import type { NextFunction, Request, Response } from 'express'

/** 鉴权中间件：会话里没有 userId 则返回 401。需先经过 session 中间件。 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.status(401).json({ error: '未登录' })
    return
  }
  next()
}
