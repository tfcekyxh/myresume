import type { NextFunction, Request, Response } from 'express'

/**
 * CSRF 兜底：写操作要求请求来源与本站同源。
 *
 * 会话 cookie 是 SameSite=Lax，跨站发起的写请求本来就带不上 cookie，
 * 已经挡住了绝大多数 CSRF。这里再按 Origin 校验一次，覆盖两种情况：
 * 将来有人误把 sameSite 放宽，以及同站不同源（子域）之间互发请求。
 *
 * 没有 Origin / Referer 的请求放行：非浏览器客户端不受 CSRF 影响，
 * 而浏览器对跨站的写请求一定会带上 Origin。
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function verifySameOrigin(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next()

  const source = req.get('origin') ?? req.get('referer')
  if (!source) return next()

  let sourceHost: string
  try {
    sourceHost = new URL(source).host
  } catch {
    res.status(403).json({ error: '请求来源不合法' })
    return
  }

  // 代理可能只透传其中一个，两个都认，避免部署环境差异导致误杀
  const ownHosts = [req.get('host'), req.get('x-forwarded-host')]
  if (!ownHosts.includes(sourceHost)) {
    res.status(403).json({ error: '请求来源不合法' })
    return
  }

  next()
}