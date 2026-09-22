import { Router } from 'express'
import { z } from 'zod'
import { createEmptyResumeData, FONT, FONT_CANDIDATES, PHOTO, resumeDataSchema } from '@mymenu/shared'
import { prisma } from '../db'
import { buildResumeDocx } from '../docx'
import { buildResumePdf } from '../pdf'
import { requireAuth } from '../require-auth'
import { findOwnResume, parseResumeData } from '../resume-utils'
import { versionsRouter } from './versions'

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

/** 简历标题。 */
const titleSchema = z.object({ title: z.string().min(1).max(50) })

/** 简历列表。登录后先进这里，再选一份进入编辑。 */
resumesRouter.get('/', async (req, res) => {
  const resumes = await prisma.resume.findMany({
    where: { userId: req.session.userId! },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, updatedAt: true },
  })

  res.json(resumes)
})

resumesRouter.post('/', async (req, res) => {
  const parsed = titleSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: '请填写简历名称（1~50 字）' })
    return
  }

  const resume = await prisma.resume.create({
    data: {
      userId: req.session.userId!,
      title: parsed.data.title,
      data: createEmptyResumeData(),
    },
    select: { id: true, title: true, updatedAt: true },
  })

  res.json(resume)
})

/** 单份简历详情。编辑页靠它初始化表单。 */
resumesRouter.get('/:id', async (req, res) => {
  const resume = await findOwnResume(req.params.id, req.session.userId!)
  if (!resume) {
    res.status(404).json({ error: '简历不存在' })
    return
  }

  res.json({
    id: resume.id,
    title: resume.title,
    data: parseResumeData(resume.data),
    photoId: resume.photoId,
    updatedAt: resume.updatedAt,
    lastArchivedAt: resume.lastArchivedAt,
  })
})

/** 重命名。 */
resumesRouter.patch('/:id', async (req, res) => {
  const resume = await findOwnResume(req.params.id, req.session.userId!)
  if (!resume) {
    res.status(404).json({ error: '简历不存在' })
    return
  }

  const parsed = titleSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: '请填写简历名称（1~50 字）' })
    return
  }

  const updated = await prisma.resume.update({
    where: { id: resume.id },
    data: { title: parsed.data.title },
    select: { id: true, title: true, updatedAt: true },
  })

  res.json(updated)
})

/** 删除。照片与版本记录随简历级联删除。 */
resumesRouter.delete('/:id', async (req, res) => {
  const resume = await findOwnResume(req.params.id, req.session.userId!)
  if (!resume) {
    res.status(404).json({ error: '简历不存在' })
    return
  }

  await prisma.resume.delete({ where: { id: resume.id } })
  res.json({ ok: true })
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

/** 导出 docx。照片以 base64 内嵌进文档，不依赖任何外部链接。 */
resumesRouter.post('/:id/export/docx', async (req, res) => {
  const resume = await findOwnResume(req.params.id, req.session.userId!)
  if (!resume) {
    res.status(404).json({ error: '简历不存在' })
    return
  }

  const photo = resume.photoId
    ? await prisma.photo.findUnique({
        where: { id: resume.photoId },
        select: { data: true },
      })
    : null

  // 字体由前端探测本机可用字体后传入，只认候选清单里的值，其余回退默认
  const requested = typeof req.body?.fontFamily === 'string' ? req.body.fontFamily : ''
  const fontFamily = FONT_CANDIDATES.includes(requested) ? requested : FONT.body

  const data = parseResumeData(resume.data)
  const buffer = await buildResumeDocx(data, photo?.data ?? null, fontFamily)

  // 文件名含姓名与日期；中文用 filename* 传，避免部分浏览器乱码
  const name = data.basic.name.trim() || resume.title
  const filename = `${name}-简历-${new Date().toISOString().slice(0, 10)}.docx`

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="resume.docx"; filename*=UTF-8''${encodeURIComponent(filename)}`
  )
  res.send(buffer)
})

/** 导出 PDF。思源黑体随文档完整嵌入，收件人无需安装字体。 */
resumesRouter.post('/:id/export/pdf', async (req, res) => {
  const resume = await findOwnResume(req.params.id, req.session.userId!)
  if (!resume) {
    res.status(404).json({ error: '简历不存在' })
    return
  }

  const photo = resume.photoId
    ? await prisma.photo.findUnique({
        where: { id: resume.photoId },
        select: { data: true },
      })
    : null

  const data = parseResumeData(resume.data)
  const buffer = await buildResumePdf(data, photo?.data ?? null)

  const name = data.basic.name.trim() || resume.title
  const filename = `${name}-简历-${new Date().toISOString().slice(0, 10)}.pdf`

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="resume.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`
  )
  res.send(buffer)
})

// 版本相关路由挂在简历下
resumesRouter.use('/:id/versions', versionsRouter)