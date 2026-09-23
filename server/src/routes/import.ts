import { Router } from 'express'
import { z } from 'zod'
import { LLM_API_KEY } from '../env'
import { requireAuth } from '../require-auth'
import { LlmOutputError, LlmUpstreamError, parseResumeWithLlm } from '../resume-import'

export const importRouter = Router()

// 导入也要登录：简历文本是敏感数据，且接口有模型调用成本
importRouter.use(requireAuth)

const parseRequestSchema = z.object({
  text: z.string().min(20, '简历内容太短了').max(50000, '简历内容不能超过 50000 字'),
})

/**
 * 无状态解析：简历文本 → ResumeData。不落库、不绑简历，
 * 覆盖草稿由前端 form.reset() 后走现有自动保存完成。
 */
importRouter.post('/parse', async (req, res) => {
  const parsed = parseRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? '内容不符合要求' })
    return
  }

  if (!LLM_API_KEY) {
    res.status(503).json({ error: '未配置大模型 API Key，导入功能暂不可用' })
    return
  }

  try {
    const data = await parseResumeWithLlm(parsed.data.text)
    res.json({ data })
  } catch (error) {
    if (error instanceof LlmUpstreamError || error instanceof LlmOutputError) {
      res.status(502).json({ error: error.message })
      return
    }
    throw error
  }
})
