import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import { RESUME_MODULE_ORDER } from '@mymenu/shared'
import { PORT } from './env'
import { authRouter } from './routes/auth'
import { sessionMiddleware } from './session'

const app = express()

// 照片以 base64 随请求体提交，默认 100kb 不够用
app.use(express.json({ limit: '2mb' }))
app.use(sessionMiddleware)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, modules: RESUME_MODULE_ORDER })
})

app.use('/api/auth', authRouter)

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ error: '服务器内部错误' })
})

app.listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT}`)
})
