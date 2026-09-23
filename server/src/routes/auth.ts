import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db'
import { rateLimit } from '../rate-limit'
import { requireAuth } from '../require-auth'
import { SESSION_COOKIE_NAME } from '../session'

export const authRouter = Router()

/**
 * 登录爆破防护。此时还没有身份，只能按 IP 限。
 * 与正常用户的登录频率相比余量很大，撞库却要付出 15 分钟 10 次的代价。
 */
const loginLimiter = rateLimit('login', {
  windowMs: 15 * 60_000,
  max: 10,
  scope: 'ip',
  message: '登录尝试过于频繁，请稍后再试',
})

/** 注册是开放入口，且注册完就能用大模型解析，按 IP 收得很紧。 */
const registerLimiter = rateLimit('register', {
  windowMs: 60 * 60_000,
  max: 2,
  scope: 'ip',
  message: '注册过于频繁，请稍后再试',
})

const loginSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(200),
})

const registerSchema = z.object({
  username: z.string().min(3, '用户名至少 3 个字符').max(50),
  password: z.string().min(6, '密码至少 6 个字符').max(200),
})

authRouter.post('/register', registerLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: '请输入 3 位以上用户名和 6 位以上密码' })
    return
  }

  const { username, password } = parsed.data

  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) {
    res.status(409).json({ error: '用户名已被占用' })
    return
  }

  const passwordHash = await Bun.password.hash(password)

  let user
  try {
    user = await prisma.user.create({ data: { username, passwordHash } })
  } catch (err) {
    // 并发注册撞唯一索引时兜底
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002') {
      res.status(409).json({ error: '用户名已被占用' })
      return
    }
    throw err
  }

  // 注册成功即登录：重建会话后写入用户 id，与登录接口一致
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()))
  })
  req.session.userId = user.id

  res.json({ id: user.id, username: user.username })
})

authRouter.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: '请填写用户名和密码' })
    return
  }

  const { username, password } = parsed.data
  const user = await prisma.user.findUnique({ where: { username } })

  // 用户不存在与密码错误返回同样的提示，避免暴露账号是否存在
  if (!user || !(await Bun.password.verify(password, user.passwordHash))) {
    res.status(401).json({ error: '用户名或密码错误' })
    return
  }

  // 登录后重建会话，避免会话固定攻击
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()))
  })
  req.session.userId = user.id

  res.json({ id: user.id, username: user.username })
})

authRouter.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: '登出失败' })
      return
    }
    res.clearCookie(SESSION_COOKIE_NAME)
    res.json({ ok: true })
  })
})

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.session.userId },
    select: { id: true, username: true },
  })
  if (!user) {
    // 会话有效但用户已被删除
    res.status(401).json({ error: '未登录' })
    return
  }
  res.json(user)
})
