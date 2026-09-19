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

/**
 * 把草稿的「已存档」基准对齐到它当前的 updatedAt，表示此刻的草稿已存在于版本中。
 *
 * 必须走原生 SQL：`updatedAt` 带 @updatedAt，任何 Prisma update 都会把它刷新成当前时间，
 * 那样基准会永远比 updatedAt 早一点点，草稿就永远显示「未存档」。
 */
function markDraftArchived(resumeId: string) {
  return prisma.$executeRaw`
    UPDATE "Resume" SET "lastArchivedAt" = "updatedAt" WHERE "id" = ${resumeId}
  `
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

  // 快照就是此刻的草稿，所以把基准对齐到当前 updatedAt：之后有改动才算未存档
  await markDraftArchived(resume.id)

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

versionsRouter.delete('/:versionId', async (req, res) => {
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

  // 只删快照这一行：照片走 photos 表且只增不改，草稿与别的版本可能还在用，不能跟着删。
  await prisma.resumeVersion.delete({ where: { id: version.id } })

  // 一份版本都不剩时，草稿就没有可回滚的存档了，把基准清空让它回到「未存档」
  const remaining = await prisma.resumeVersion.count({ where: { resumeId: resume.id } })
  if (remaining === 0) {
    await prisma.$executeRaw`
      UPDATE "Resume" SET "lastArchivedAt" = NULL WHERE "id" = ${resume.id}
    `
  }

  res.json({ ok: true })
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

  // 恢复后的草稿与某版本内容一致，算作已存档；之后有改动才会再标未存档。
  await markDraftArchived(resume.id)

  res.json(updated)
})
