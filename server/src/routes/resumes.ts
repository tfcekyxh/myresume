import { Router } from 'express'
import { z } from 'zod'
import { createEmptyResumeData, PHOTO, resumeDataSchema } from '@mymenu/shared'
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

/** 按 id 取当前用户的简历。带上 userId 条件，别人的 id 一律当作不存在。 */
function findOwnResume(resumeId: string, userId: string) {
  return prisma.resume.findFirst({
    where: { id: resumeId, userId },
    select: { id: true, photoId: true },
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
  const resume = await findOwnResume(req.params.id, req.session.userId!)
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

/** 照片：前端压缩后的 JPEG base64，不含 data URL 前缀。 */
const photoSchema = z.object({ data: z.string().min(1) })

/** base64 解码后的字节数，不实际解码。 */
function base64ByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}

resumesRouter.get('/:id/photo', async (req, res) => {
  const resume = await findOwnResume(req.params.id, req.session.userId!)
  if (!resume) {
    res.status(404).json({ error: '简历不存在' })
    return
  }
  if (!resume.photoId) {
    res.status(404).json({ error: '还没有上传照片' })
    return
  }

  const photo = await prisma.photo.findUnique({
    where: { id: resume.photoId },
    select: { id: true, data: true },
  })
  if (!photo) {
    res.status(404).json({ error: '照片不存在' })
    return
  }

  res.json(photo)
})

resumesRouter.post('/:id/photo', async (req, res) => {
  const resume = await findOwnResume(req.params.id, req.session.userId!)
  if (!resume) {
    res.status(404).json({ error: '简历不存在' })
    return
  }

  const parsed = photoSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: '照片内容不正确' })
    return
  }

  const { data } = parsed.data
  if (base64ByteLength(data) > PHOTO.maxBase64Bytes) {
    const limitKb = Math.round(PHOTO.maxBase64Bytes / 1024)
    res.status(400).json({ error: `照片不能超过 ${limitKb} KB` })
    return
  }

  // 与当前照片内容相同就复用，避免反复上传同一张图把 photos 撑大
  if (resume.photoId) {
    const current = await prisma.photo.findUnique({
      where: { id: resume.photoId },
      select: { data: true },
    })
    if (current?.data === data) {
      res.json({ id: resume.photoId })
      return
    }
  }

  // photos 只增不改：换照片即插新行，旧行留给历史版本引用
  const photo = await prisma.photo.create({
    data: { resumeId: resume.id, data },
    select: { id: true },
  })
  await prisma.resume.update({
    where: { id: resume.id },
    data: { photoId: photo.id },
  })

  res.json(photo)
})
