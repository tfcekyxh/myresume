import connectPgSimple from 'connect-pg-simple'
import session from 'express-session'
import { DATABASE_URL, IS_PRODUCTION, SESSION_SECRET } from './env'

declare module 'express-session' {
  interface SessionData {
    userId: string
  }
}

const PgStore = connectPgSimple(session)

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

export const SESSION_COOKIE_NAME = 'connect.sid'

export const sessionMiddleware = session({
  store: new PgStore({
    conString: DATABASE_URL,
    createTableIfMissing: true,
  }),
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
