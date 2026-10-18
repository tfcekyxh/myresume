import path from 'node:path'

export const SESSION_SECRET = required('SESSION_SECRET')
export const PORT = Number(process.env.PORT ?? 3000)
export const IS_PRODUCTION = process.env.NODE_ENV === 'production'

/**
 * 库文件路径。单机自部署，整库就是一个文件，所以默认放在 server/data/ 下，
 * 不需要任何配置即可开箱运行；换成别的路径（比如挂载的卷）时在 .env 里指过来。
 *
 * 一律解析成绝对路径：drizzle-kit CLI 与运行时的相对路径基准不同，写绝对路径才没歧义。
 */
export const SQLITE_PATH = path.resolve(
  process.env.SQLITE_PATH || path.join(import.meta.dirname, '..', 'data', 'app.sqlite'),
)

/**
 * 数据备份页（导出 / 导入整库）的唯一管理员。
 * 留空表示没人有权限，接口一律 403——避免忘了配就把整库替换的口子开着。
 */
export const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? ''

/**
 * 简历导入解析用的大模型（OpenAI 兼容 Chat Completions 接口）。
 * 默认智谱 GLM-4-Flash；不设为启动必需，未配 Key 时导入接口返回 503。
 */
export const LLM_BASE_URL = process.env.LLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4'
export const LLM_API_KEY = process.env.LLM_API_KEY ?? ''
export const LLM_MODEL = process.env.LLM_MODEL ?? 'glm-4-flash'

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`缺少环境变量 ${name}，请检查 server/.env`)
  }
  return value
}
