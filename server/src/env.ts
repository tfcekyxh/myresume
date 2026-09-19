function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`缺少环境变量 ${name}，请检查 server/.env`)
  }
  return value
}

export const DATABASE_URL = required('DATABASE_URL')
export const SESSION_SECRET = required('SESSION_SECRET')
export const PORT = Number(process.env.PORT ?? 3000)
export const IS_PRODUCTION = process.env.NODE_ENV === 'production'
