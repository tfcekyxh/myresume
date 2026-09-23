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

/**
 * 简历导入解析用的大模型（OpenAI 兼容 Chat Completions 接口）。
 * 默认智谱 GLM-4-Flash；不设为启动必需，未配 Key 时导入接口返回 503。
 */
export const LLM_BASE_URL = process.env.LLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4'
export const LLM_API_KEY = process.env.LLM_API_KEY ?? ''
export const LLM_MODEL = process.env.LLM_MODEL ?? 'glm-4-flash'
