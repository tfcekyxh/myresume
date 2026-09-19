import { Router, type Request } from 'express'
import { z } from 'zod'
import { prisma } from '../db'
import { requireAuth } from '../require-auth'
import { findOwnResume, parseResumeData } from '../resume-utils'

/** 挂在 /api/resumes/:id/versions 下，需要 mergeParams 才能读到 :id。 */
export const versionsRouter = Router({ mergeParams: true })

versionsRouter.use(requireAuth)

/**
 * mergeParams 能拿到父级的 :id，但 Express 的类型里看不到，这里收口一次。
 */
function parentResumeId(req: Request) {
  return (req.params as { id: string }).id
}

const createSchema = z.object({
  note: z.string().max(200).optional(),
})

/** 取某个版本，同时确认它属于这份简历。 */
function findOwnVersion(resumeId: string, versionId: string) {
  return prisma.resumeVersion.findFirst({
    where: { id: versionId, resumeId },
  })
}

versionsRouter.get('/', async (req, res) => {
  const resume = await findOwnResume(parentResumeId(req), req.session.userId!)
  if (!resume) {
    res.status(404).json({ error: '简历不存在' })
    return
  }

  // 列表不带快照本体，避免响应过大
  const versions = await prisma.resumeVersion.findMany({
    where: { resumeId: resume.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, note: true, createdAt: true },
  })

  res.json(versions)
})

versionsRouter.post('/', async (req, res) => {
  const resume = await findOwnResume(parentResumeId(req), req.session.userId!)
  if (!resume) {
    res.status(404).json({ error: '简历不存在' })
    return
  }

  const parsed = createSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    res.status(400).json({ error: '备注过长' })
    return
  }

  // 快照连同当时的照片一起记下来，恢复时照片也回到当时那张
  const version = await prisma.resumeVersion.create({
    data: {
      resumeId: resume.id,
      snapshot: parseResumeData(resume.data),
      photoId: resume.photoId,
      note: parsed.data.note || null,
    },
    select: { id: true, note: true, createdAt: true },
  })

  res.json(version)
})

versionsRouter.get('/:versionId', async (req, res) => {
  const resume = await findOwnResume(parentResumeId(req), req.session.userId!)
  if (!resume) {
    res.status(404).json({ error: '简历不存在' })
    return
  }

  const version = await findOwnVersion(resume.id, req.params.versionId)
  if (!version) {
    res.status(404).json({ error: '版本不存在' })
    return
  }

  // 查看历史版本要显示当时的照片，一并返回省掉一次请求
  const photo = version.photoId
    ? await prisma.photo.findUnique({
        where: { id: version.photoId },
        select: { id: true, data: true },
      })
    : null

  res.json({
    id: version.id,
    note: version.note,
    createdAt: version.createdAt,
    snapshot: parseResumeData(version.snapshot),
    photoId: version.photoId,
    photo,
  })
})

versionsRouter.post('/:versionId/restore', async (req, res) => {
  const resume = await findOwnResume(parentResumeId(req), req.session.userId!)
  if (!resume) {
    res.status(404).json({ error: '简历不存在' })
    return
  }

  const version = await findOwnVersion(resume.id, req.params.versionId)
  if (!version) {
    res.status(404).json({ error: '版本不存在' })
    return
  }

  // 用快照覆盖草稿：内容与照片都回到当时的值。
  // 不生成新版本，也不做 diff——这是刻意的简化。
  const updated = await prisma.resume.update({
    where: { id: resume.id },
    data: {
      data: parseResumeData(version.snapshot),
      photoId: version.photoId,
    },
    select: { id: true, updatedAt: true },
  })

  res.json(updated)
})
