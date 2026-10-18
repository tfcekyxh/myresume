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

/**
 * 邮件发送通道（每月自动备份邮件、简历版本发送到邮箱两处共用）。
 *
 * 发信走第三方邮件 API 的 HTTP 接口（默认 Resend，请求体与它兼容），
 * 不走 SMTP——云端平台对出站 25/465 端口常有封锁，HTTP 接口更稳。
 * 未配 MAIL_API_KEY 时这两处功能都直接关闭，与 LLM_* 一样不设为启动必需。
 */
export const MAIL_API_URL = process.env.MAIL_API_URL ?? 'https://api.resend.com/emails'
export const MAIL_API_KEY = process.env.MAIL_API_KEY ?? ''
/** Resend 未验证域名时只能用它的测试发件地址，且只能发给注册邮箱。 */
export const MAIL_FROM = process.env.MAIL_FROM ?? 'onboarding@resend.dev'
/**
 * 收件人，可逗号分隔多个。
 *
 * **刻意不给默认值**：真实邮箱只留在 `server/.env`（不入库）或部署面板的环境变量里，
 * 仓库里不出现任何真实地址。留空时 `mailConfigured()` 判定为未配置，两处发信功能一起关闭。
 */
export const MAIL_TO = (process.env.MAIL_TO ?? '')
  .split(',')
  .map((address) => address.trim())
  .filter(Boolean)

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`缺少环境变量 ${name}，请检查 server/.env`)
  }
  return value
}
