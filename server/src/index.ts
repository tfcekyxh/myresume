import path from 'node:path'
import express from 'express'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import helmet from 'helmet'
import { RESUME_MODULE_ORDER } from '@mymenu/shared'
import { verifySameOrigin } from './csrf'
import { IS_PRODUCTION, PORT } from './env'
import { rateLimit } from './rate-limit'
import { authRouter } from './routes/auth'
import { importRouter } from './routes/import'
import { resumesRouter } from './routes/resumes'
import { sessionMiddleware } from './session'

const app = express()

// 生产环境跑在 Railway 的反向代理后面，不信任代理时 req.secure 恒为 false，
// secure cookie 就不会下发，表现为登录成功却立刻掉线。
if (IS_PRODUCTION) app.set('trust proxy', 1)

// helmet 的类型签名基于 node 原生 IncomingMessage/ServerResponse，与 Express 5 的
// RequestHandler 对不上（运行时完全兼容），这里断言一次，避免每个调用点都报错。
const securityHeaders = helmet({
  // 前端由本进程托管（生产），这些指令同时作用于页面与接口响应。
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // 证件照是 base64 data URL，直接用在 <img src> 上
      imgSrc: ["'self'", 'data:', 'blob:'],
      // 样式都是打包产物，但 dnd-kit 之类会在元素上写内联 style 属性
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  // 本地开发走 http，HSTS 头只会被浏览器忽略，索性只在生产下发
  hsts: IS_PRODUCTION,
  // 同源请求才带 Referer，跨站一律不带——CSRF 校验的兜底信息来源
  referrerPolicy: { policy: 'same-origin' },
}) as unknown as RequestHandler

app.use(securityHeaders)

// 全局兜底限流：阈值定得宽松，正常使用踩不到，只拦明显异常的流量。
// 精确防护交给各接口自己的限流器。
app.use(
  '/api',
  rateLimit('global', {
    windowMs: 60_000,
    max: 600,
    scope: 'ip',
    message: '请求过于频繁，请稍后再试',
  }),
)

// 照片以 base64 随请求体提交，默认 100kb 不够用
app.use(express.json({ limit: '2mb' }))
// 写操作先过同源校验，再看会话
app.use(verifySameOrigin)
app.use(sessionMiddleware)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, modules: RESUME_MODULE_ORDER })
})

app.use('/api/auth', authRouter)
app.use('/api/resumes', resumesRouter)
app.use('/api/import', importRouter)

// 生产环境由本进程一并托管前端构建产物，单服务部署，前后端同源。
// 开发期前端跑在 Vite dev server 上，这里不参与，免得访问 :3000 看到过期构建。
if (IS_PRODUCTION) {
  const clientDist = path.resolve(import.meta.dirname, '../../client/dist')

  app.use(
    express.static(clientDist, {
      // 交给下面的 fallback 统一返回，好统一控制 index.html 的缓存
      index: false,
      setHeaders(res, filePath) {
        // 带 hash 的资源内容不变，可以长期强缓存
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
      },
    }),
  )

  // SPA fallback：前端用 BrowserRouter，/resumes/:id/edit 这类深链刷新时
  // 浏览器会直接向服务器要这个路径，必须回 index.html 交给前端路由。
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    // 接口的 404 要保持 404，不能被前端页面吞掉
    if (req.path.startsWith('/api')) return next()
    // 带扩展名的是静态资源请求，缺失就该 404，回 HTML 会让浏览器按 JS/CSS 解析出错
    if (path.extname(req.path)) return next()
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ error: '服务器内部错误' })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`server listening on http://0.0.0.0:${PORT}`)
})
