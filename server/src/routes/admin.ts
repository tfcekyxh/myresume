import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { and, eq } from 'drizzle-orm'
import express, { type Response, Router } from 'express'
import { FONT, FONT_CANDIDATES } from '@mymenu/shared'
import { requireAdmin } from '../admin'
import { InvalidSnapshotError, createSnapshot, inspectSnapshot, restoreFrom, stamp } from '../backup'
import { db } from '../db'
import { buildResumeDocx } from '../docx'
import { mailConfigured, mailRecipients, sendMail } from '../mail'
import { buildResumePdf } from '../pdf'
import { rateLimit } from '../rate-limit'
import { requireAuth } from '../require-auth'
import { findOwnResume, parseResumeData } from '../resume-utils'
import { photos, resumeVersions } from '../schema'

/** 挂在 /api/admin 下，只有环境变量指定的管理员能用（见 admin.ts）。 */
export const adminRouter = Router()

adminRouter.use(requireAuth, requireAdmin)

/**
 * 整库导出要打包整个文件、导入要覆盖整个库，都是重操作，按用户收紧。
 * 顺带挡住「反复导入」这种把库反复替换掉的行为。
 */
const backupLimiter = rateLimit('backup', {
  windowMs: 60_000,
  max: 5,
  scope: 'user',
  message: '备份操作过于频繁，请稍后再试',
})

/**
 * 备份文件走二进制体提交。
 *
 * 全局的 express.json 上限是 2mb，整库文件很容易超过，所以这两个接口
 * 单独挂一个 raw 解析器（Content-Type 是 octet-stream，json 解析器不会插手）。
 */
const binaryBody = express.raw({ type: 'application/octet-stream', limit: '200mb' })

/** 把上传的二进制体落到临时文件交给 backup.ts 处理，用完即删。 */
function withUploadedFile<T>(body: unknown, run: (file: string) => T): T {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new InvalidSnapshotError('没有收到文件内容')
  }

  const dir = mkdtempSync(path.join(tmpdir(), 'mymenu-upload-'))

  try {
    const file = path.join(dir, 'upload.sqlite')
    writeFileSync(file, body)
    return run(file)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function respondError(res: Response, err: unknown) {
  if (err instanceof InvalidSnapshotError) {
    res.status(400).json({ error: err.message })
    return
  }

  console.error('[backup] 操作失败:', err)
  res.status(500).json({ error: '备份操作失败' })
}

/** 导出整库：下发一份当前库的一致快照。 */
adminRouter.get('/backup', backupLimiter, (_req, res) => {
  let snapshot: { file: string; cleanup: () => void }

  try {
    snapshot = createSnapshot()
  } catch (err) {
    respondError(res, err)
    return
  }

  const filename = `mymenu-backup-${stamp()}.sqlite`
  res.setHeader('Content-Type', 'application/octet-stream')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="backup.sqlite"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  )

  res.sendFile(snapshot.file, (err) => {
    // 临时目录由这次请求创建，发完（或出错）就清掉
    snapshot.cleanup()

    if (err && !res.headersSent) {
      console.error('[backup] 下发快照失败:', err)
      res.status(500).json({ error: '导出失败' })
    }
  })
})

/** 校验上传的备份，返回摘要供前端二次确认展示。此时还没有动过任何数据。 */
adminRouter.post('/backup/validate', backupLimiter, binaryBody, (req, res) => {
  try {
    res.json(withUploadedFile(req.body, inspectSnapshot))
  } catch (err) {
    respondError(res, err)
  }
})

/** 用上传的备份整体覆盖当前库。此操作不可撤销，导入前会自动留一份当前库的快照。 */
adminRouter.post('/backup/import', backupLimiter, binaryBody, (req, res) => {
  try {
    const { summary, backupFile } = withUploadedFile(req.body, restoreFrom)
    // 会话也随库一起被还原，前端拿到响应后会强制回到登录页
    res.json({ ok: true, ...summary, backupFile: path.basename(backupFile) })
  } catch (err) {
    respondError(res, err)
  }
})

/**
 * 发送简历到邮箱：按用户收紧，一次要现做 docx 与 PDF 两个文档，比普通导出重。
 * 与限流表里的其它窗口互不干扰，所以单独用一个 key（见 rate-limit.ts）。
 */
const mailLimiter = rateLimit('resume-mail', {
  windowMs: 60_000,
  max: 5,
  scope: 'user',
  message: '发送过于频繁，请稍后再试',
})

/** 版本快照引用的那张照片，导出时内嵌进文档。 */
async function findPhotoData(photoId: string) {
  const [photo] = await db
    .select({ data: photos.data })
    .from(photos)
    .where(eq(photos.id, photoId))
    .limit(1)

  return photo ?? null
}

/** 把存档时间按使用者时区展示；服务器跑在 UTC，不指定时区会差 8 小时。 */
function formatArchivedAt(at: Date) {
  return at.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 把某个存档版本导出成 Word + PDF，一并发到配置的邮箱。
 *
 * 取的是**版本快照**而不是当前草稿：发出去的必须是那一份确定的内容。
 * 与数据备份同属管理员能力（本路由已挂 requireAdmin），普通账号看不到入口，直接打接口也是 403。
 */
adminRouter.post(
  '/resumes/:resumeId/versions/:versionId/email',
  mailLimiter,
  async (req, res) => {
    if (!mailConfigured()) {
      res.status(503).json({ error: '未配置邮件发送通道，无法发送（需设置 MAIL_API_KEY）' })
      return
    }

    const resume = await findOwnResume(req.params.resumeId, req.session.userId!)
    if (!resume) {
      res.status(404).json({ error: '简历不存在' })
      return
    }

    const [version] = await db
      .select()
      .from(resumeVersions)
      .where(
        and(
          eq(resumeVersions.id, req.params.versionId),
          eq(resumeVersions.resumeId, resume.id),
        ),
      )
      .limit(1)

    if (!version) {
      res.status(404).json({ error: '版本不存在' })
      return
    }

    const photo = version.photoId ? await findPhotoData(version.photoId) : null
    const data = parseResumeData(version.snapshot)

    // 字体由前端探测本机可用字体后传入，只认候选清单里的值，其余回退默认。
    // 邮件里的 docx 同样不嵌字体，所以这里沿用与下载 docx 完全一致的规则。
    const requested = typeof req.body?.fontFamily === 'string' ? req.body.fontFamily : ''
    const fontFamily = FONT_CANDIDATES.includes(requested) ? requested : FONT.body

    const [docx, pdf] = await Promise.all([
      buildResumeDocx(data, photo?.data ?? null, fontFamily),
      buildResumePdf(data, photo?.data ?? null),
    ])

    const name = data.basic.name.trim() || resume.title
    const date = version.createdAt.toISOString().slice(0, 10)
    const docxFilename = `${name}-简历-${date}.docx`
    const pdfFilename = `${name}-简历-${date}.pdf`

    try {
      await sendMail({
        subject: `简历：${name}（${date}）`,
        text: [
          '附件是这个存档版本的 Word 与 PDF：',
          '',
          `- ${docxFilename}：可自行编辑`,
          `- ${pdfFilename}：最终交付版，字体与分页已固定`,
          '',
          `存档时间：${formatArchivedAt(version.createdAt)}`,
          `备注：${version.note || '（无备注）'}`,
        ].join('\n'),
        attachments: [
          { filename: docxFilename, content: docx },
          { filename: pdfFilename, content: pdf },
        ],
      })
    } catch (err) {
      // 邮件通道的问题（Key 失效、发件地址没验证等）都要把原因带到日志里
      console.error('[mail] 发送简历失败:', err)
      res.status(502).json({ error: '发送失败，请稍后重试' })
      return
    }

    res.json({ ok: true, to: mailRecipients() })
  },
)
