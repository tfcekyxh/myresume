import { expect, test, type Page } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  clearResumes,
  createResume,
  listResumes,
  loginAsDefaultUser,
  PASSWORD,
  USERNAME,
} from './helpers'
import { clearRateLimits, deleteUsersByUsername, disconnectDb, ensureTestUser } from './db'

/**
 * 数据备份（整库导出 / 导入）。
 *
 * 这次测试里专用账号 e2e-tester 就是管理员（webServer 把 ADMIN_USERNAME 指到它），
 * 非管理员账号用 db.ts 的 ensureTestUser 直接造，不走注册接口——
 * 注册是 1 小时 2 次的生产级限流，会让整轮变脆。
 *
 * 注意副作用：导入是整库覆盖（连 User 表一起换），且本文件按字母序排在最前，
 * 所以跑完必须把专用账号重新确保一遍，免得后面所有用例都登不进来。
 * 三个备份写接口都是 1 分钟 5 次，用例里按最少次数调用。
 */

const NON_ADMIN_USERNAME = 'e2e-non-admin'
const NON_ADMIN_PASSWORD = 'non-admin-pw-123'

test.afterAll(async () => {
  await deleteUsersByUsername([NON_ADMIN_USERNAME])
  // 导入会覆盖 User 表，确保专用账号还在（幂等，已存在则直接返回）
  await ensureTestUser(USERNAME, PASSWORD)
  await disconnectDb()
})

/** 随机的临时备份文件路径（导出产物落这里，用例结束即删）。 */
function tempBackupPath(): string {
  return join(tmpdir(), `mymenu-backup-${Date.now()}-${randomBytes(4).toString('hex')}.sqlite`)
}

/** 点「导出备份」，等浏览器下载开始并落盘，返回建议文件名。 */
async function exportBackup(page: Page, filePath: string): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('backup-export-button').click(),
  ])
  await download.saveAs(filePath)
  return download.suggestedFilename()
}

test('管理员导出备份，产物是合法且一致的 SQLite 库', async ({ page }) => {
  await loginAsDefaultUser(page)
  await clearResumes()
  await createResume(page, '导出快照用简历')

  // 管理员在简历列表页能看到入口，点进 /admin
  await page.getByRole('link', { name: '数据备份' }).click()
  await expect(page).toHaveURL('/admin')

  const filePath = tempBackupPath()
  try {
    const filename = await exportBackup(page, filePath)
    expect(filename).toMatch(/^mymenu-backup-.*\.sqlite$/)

    // 产物必须是一个能被 SQLite 打开、且结构与本应用一致的库
    const snapshot = new DatabaseSync(filePath)
    try {
      const integrity = snapshot.prepare('PRAGMA integrity_check').get() as {
        integrity_check: string
      }
      expect(integrity.integrity_check).toBe('ok')

      const tables = (
        snapshot.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
          name: string
        }[]
      ).map((row) => row.name)
      for (const table of ['User', 'Resume', 'Photo', 'ResumeVersion']) {
        expect(tables).toContain(table)
      }

      // 快照里含当前账号，且它的简历数与导出前一致
      const count = snapshot
        .prepare(
          'SELECT COUNT(*) AS n FROM Resume WHERE userId = (SELECT id FROM User WHERE username = ?)',
        )
        .get(USERNAME) as { n: number }
      expect(count.n).toBe(1)
    } finally {
      snapshot.close()
    }
  } finally {
    await rm(filePath, { force: true })
  }
})

test('管理员导入刚导出的备份，确认后整库被覆盖', async ({ page }) => {
  await loginAsDefaultUser(page)
  await clearResumes()
  await page.goto('/admin')

  const filePath = tempBackupPath()
  try {
    // 快照：此刻账号下 0 份简历
    await exportBackup(page, filePath)

    // 导出之后新建一份简历，导入后它应该不复存在——这就是「整库被覆盖」的证据
    const createdId = await createResume(page, '导入前新建的简历')

    await page.getByTestId('backup-file-input').setInputFiles(filePath)

    // 选完文件会自动校验，通过后弹出确认弹窗并展示摘要
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('确认导入这份备份？')).toBeVisible()
    // 摘要列表（dl）里逐项展示快照内容；description 里也有这些词，所以要限到 dl
    const summary = dialog.locator('dl')
    await expect(summary.getByText('账号', { exact: true })).toBeVisible()
    await expect(summary.getByText('简历', { exact: true })).toBeVisible()
    await expect(summary.getByText('证件照', { exact: true })).toBeVisible()

    const importDone = page.waitForResponse(
      (res) =>
        res.request().method() === 'POST' &&
        res.url().includes('/api/admin/backup/import'),
    )
    await page.getByTestId('backup-import-confirm').click()
    expect((await importDone).status()).toBe(200)

    // 导入把整库连同会话一起还原，当前登录态是「还原出来的」还是「已失效」不确定。
    // 不猜：等客户端离开 /admin 后清掉 cookie，注定回到登录页，再以管理员身份重新登录。
    await expect(page).not.toHaveURL('/admin')
    await page.context().clearCookies()
    await loginAsDefaultUser(page)

    // 关键断言：导入前新建的简历，导入后确实消失了
    const resumes = await listResumes(page)
    expect(resumes.map((resume) => resume.id)).not.toContain(createdId)
  } finally {
    await rm(filePath, { force: true })
  }
})

test('非管理员无权访问备份：看不到入口、访问被重定向、接口被拒', async ({ page }) => {
  await clearRateLimits()
  await ensureTestUser(NON_ADMIN_USERNAME, NON_ADMIN_PASSWORD)

  await page.goto('/login')
  await page.getByLabel('用户名').fill(NON_ADMIN_USERNAME)
  await page.getByLabel('密码').fill(NON_ADMIN_PASSWORD)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL('/resumes')

  // 简历列表页页头没有「数据备份」入口
  await expect(page.getByRole('link', { name: '数据备份' })).toHaveCount(0)

  // 直接访问 /admin 被路由守卫弹回 /resumes
  await page.goto('/admin')
  await expect(page).toHaveURL('/resumes')

  // 三个接口一律 403（先过 requireAuth，再过 requireAdmin）
  const exportRes = await page.request.get('/api/admin/backup')
  expect(exportRes.status()).toBe(403)

  for (const path of ['/api/admin/backup/validate', '/api/admin/backup/import']) {
    const res = await page.request.post(path, {
      data: 'not-a-backup',
      headers: { 'Content-Type': 'application/octet-stream' },
    })
    expect(res.status()).toBe(403)
  }
})

test('上传非法备份文件时提示中文错误且数据不受影响', async ({ page }) => {
  await loginAsDefaultUser(page)
  await clearResumes()
  const resumeId = await createResume(page, '非法文件测试简历')

  await page.goto('/admin')

  await page.getByTestId('backup-file-input').setInputFiles({
    name: 'not-a-backup.sqlite',
    mimeType: 'application/octet-stream',
    buffer: randomBytes(4096),
  })

  // 校验失败时在页面下方以 text-destructive 展示中文说明
  const error = page.locator('p.text-destructive')
  await expect(error).toBeVisible()
  await expect(error).toContainText(/[\u4e00-\u9fa5]/)

  // 校验失败不动数据，也不会弹确认弹窗
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // 端到端确认没被覆盖：这份简历还在
  const resumes = await listResumes(page)
  expect(resumes.map((resume) => resume.id)).toContain(resumeId)
})
