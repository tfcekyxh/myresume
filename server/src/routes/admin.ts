import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import express, { type Response, Router } from 'express'
import { requireAdmin } from '../admin'
import { InvalidSnapshotError, createSnapshot, inspectSnapshot, restoreFrom, stamp } from '../backup'
import { rateLimit } from '../rate-limit'
import { requireAuth } from '../require-auth'

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
