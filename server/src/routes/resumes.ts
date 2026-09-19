import { Router } from 'express'
import { z } from 'zod'
import { createEmptyResumeData, resumeDataSchema } from '@mymenu/shared'
import { prisma } from '../db'
import { requireAuth } from '../require-auth'

export const resumesRouter = Router()

// 本路由下所有接口都要求登录
resumesRouter.use(requireAuth)

/** 草稿内容。包一层是为了将来能加 title 之类的字段。 */
const draftSchema = z.object({ data: resumeDataSchema })

/** 把 zod 的 issues 转成可读的一行行说明。 */
function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.') || '(根)'
    return `${path}：${issue.message}`
  })
}

/**
 * 读库里的草稿并解析。
 *
 * 库里理论上都是通过 schema 校验写入的，但 schema 会演进、数据也可能被手工改过，
 * 解析失败时退回空草稿，避免把坏数据抛给前端。
 */
function parseDraft(raw: unknown) {
  const parsed = resumeDataSchema.safeParse(raw)
  return parsed.success ? parsed.data : createEmptyResumeData()
}

/** 取当前用户唯一那份简历，没有就建一份。 */
async function findOrCreateResume(userId: string) {
  const existing = await prisma.resume.findFirst({ where: { userId } })
  if (existing) return existing

  return prisma.resume.create({
    data: { userId, data: createEmptyResumeData() },
  })
}

resumesRouter.get('/current', async (req, res) => {
  // requireAuth 保证进来了就一定有 userId
  const resume = await findOrCreateResume(req.session.userId!)

  res.json({
    id: resume.id,
    title: resume.title,
    data: parseDraft(resume.data),
    photoId: resume.photoId,
    updatedAt: resume.updatedAt,
  })
})

resumesRouter.patch('/:id/draft', async (req, res) => {
  // 先判归属：带上 userId 一起查，别人的 resume id 一律当作不存在
  const resume = await prisma.resume.findFirst({
    where: { id: req.params.id, userId: req.session.userId! },
    select: { id: true },
  })
  if (!resume) {
    res.status(404).json({ error: '简历不存在' })
    return
  }

  const parsed = draftSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({
      error: '简历内容格式不正确',
      issues: formatIssues(parsed.error),
    })
    return
  }

  const updated = await prisma.resume.update({
    where: { id: resume.id },
    data: { data: parsed.data.data },
    select: { id: true, updatedAt: true },
  })

  res.json(updated)
})
