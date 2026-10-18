import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createResume,
  getCurrentResumeId,
  openVersions,
  setupResumeForEdit,
} from './helpers'
import { clearRateLimits, deleteUsersByUsername, disconnectDb, ensureTestUser } from './db'
import { E2E_MAIL_TO } from './env'
import { clearMails, getMails } from './mail'

/**
 * 版本「发送到邮箱」（仅管理员可见）。
 *
 * 走真实浏览器 + 真实后端，发信落到 e2e/fake-mail-server.ts 这个假服务上
 * （webServer 把 MAIL_API_URL 指过去并配了 MAIL_API_KEY），全程不碰真实邮件 API。
 *
 * 管理员就是专用测试账号 e2e-tester（webServer 的 ADMIN_USERNAME），
 * 非管理员账号用 db.ts 的 ensureTestUser 直接造，不走注册接口（注册是 1 小时 2 次的限流）。
 *
 * 接口限流是每用户每分钟 5 次，登录时 loginAsDefaultUser 已清过计数，用例每次只点一下。
 */

const NON_ADMIN_USERNAME = 'e2e-versions-non-admin'
const NON_ADMIN_PASSWORD = 'non-admin-pw-123'

test.afterAll(async () => {
  await deleteUsersByUsername([NON_ADMIN_USERNAME])
  await disconnectDb()
})

/** 改姓名并等自动保存真正落库（避免只读到上一次的「已保存」）。 */
async function editNameAndWaitSaved(page: Page, name: string) {
  const saved = page.waitForResponse(
    (res) =>
      res.request().method() === 'PATCH' &&
      res.url().includes('/draft') &&
      res.status() === 200
  )
  await page.getByLabel('姓名').fill(name)
  await saved
  await expect(page.getByTestId('save-status')).toHaveText('已保存')
}

/** 在编辑页用「存档」按钮存一个带备注的版本（走真实 UI）。 */
async function saveVersionViaUi(page: Page, note: string) {
  await page.getByRole('button', { name: '存档', exact: true }).click()
  await expect(page.getByText('存档当前内容')).toBeVisible()
  await page.getByLabel('备注（可选）').fill(note)
  await page.getByRole('button', { name: '确认存档', exact: true }).click()
  await expect(page.getByText('存档当前内容')).not.toBeVisible()
}

/** 把 base64 落成临时 docx 文件，解出 word/document.xml 后删掉临时文件。 */
function readDocxDocumentXml(contentBase64: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-mail-docx-'))
  const file = join(dir, 'attachment.docx')
  try {
    writeFileSync(file, Buffer.from(contentBase64, 'base64'))
    return execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('管理员能把存档版本发送到邮箱，附件是快照内容的 docx 与 pdf', async ({ page }) => {
  await setupResumeForEdit(page)
  await clearMails()

  // 先用「快照姓名」存档，再把草稿姓名改成别的——用它当反例，
  // 证明邮件里发的是存档那一刻的快照，而不是当前草稿。
  await editNameAndWaitSaved(page, '快照姓名')
  await saveVersionViaUi(page, '要发邮件的版本')
  await editNameAndWaitSaved(page, '改后姓名')

  const resumeId = await getCurrentResumeId(page)
  await openVersions(page, resumeId)

  const row = page.getByRole('listitem').filter({ hasText: '要发邮件的版本' })
  const emailButton = row.getByRole('button', { name: '发送到邮箱' })
  // 存档版本行上有这个按钮；顶部「当前草稿」行没有，所以总数是 1
  await expect(emailButton).toBeVisible()
  await expect(page.getByRole('button', { name: '发送到邮箱' })).toHaveCount(1)

  const sent = page.waitForResponse(
    (res) =>
      res.request().method() === 'POST' &&
      res.url().includes('/versions/') &&
      res.url().endsWith('/email')
  )
  await emailButton.click()
  expect((await sent).status()).toBe(200)

  // 成功 toast 带上收件人地址（webServer 注入的测试收件人）
  await expect(page.getByText(`已发送到 ${E2E_MAIL_TO}`)).toBeVisible()

  // 假服务确实收到了这一封（按 subject 过滤——备份定时器的整库邮件会混进来）
  const mails = await getMails()
  const mail = mails.find((item) => item.subject.startsWith('简历：'))
  expect(mail).toBeTruthy()
  expect(mail!.subject).toContain('快照姓名')
  expect(mail!.to).toContain(E2E_MAIL_TO)

  // 两个附件：docx 与 pdf 各一个，内容非空
  const docx = mail!.attachments.find((attachment) => attachment.filename.endsWith('.docx'))
  const pdf = mail!.attachments.find((attachment) => attachment.filename.endsWith('.pdf'))
  expect(docx).toBeTruthy()
  expect(pdf).toBeTruthy()

  const docxBuffer = Buffer.from(docx!.content, 'base64')
  const pdfBuffer = Buffer.from(pdf!.content, 'base64')
  expect(docxBuffer.byteLength).toBeGreaterThan(0)
  expect(pdfBuffer.byteLength).toBeGreaterThan(0)
  // docx 是 zip（魔数 PK），pdf 以 %PDF 开头
  expect(docxBuffer.subarray(0, 2).toString('latin1')).toBe('PK')
  expect(pdfBuffer.subarray(0, 4).toString('latin1')).toBe('%PDF')

  // 解出 document.xml：发的是快照姓名，而不是存档后改成的草稿姓名
  const xml = readDocxDocumentXml(docx!.content)
  expect(xml).toContain('快照姓名')
  expect(xml).not.toContain('改后姓名')
})

test('非管理员看不到「发送到邮箱」按钮', async ({ page }) => {
  await clearRateLimits()
  await ensureTestUser(NON_ADMIN_USERNAME, NON_ADMIN_PASSWORD)

  await page.goto('/login')
  await page.getByLabel('用户名').fill(NON_ADMIN_USERNAME)
  await page.getByLabel('密码').fill(NON_ADMIN_PASSWORD)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL('/resumes')

  // 给这个普通账号造一份带存档版本的简历
  const resumeId = await createResume(page, '普通账号的简历')
  const created = await page.request.post(`/api/resumes/${resumeId}/versions`, {
    data: { note: '普通账号的版本' },
  })
  expect(created.ok()).toBe(true)

  // 等 /api/auth/me 回来再断言，否则「按钮不存在」可能只是因为用户信息还没加载
  const meLoaded = page.waitForResponse(
    (res) => res.url().includes('/api/auth/me') && res.status() === 200
  )
  await openVersions(page, resumeId)
  await meLoaded

  await expect(page.getByText('普通账号的版本')).toBeVisible()
  // 版本行照常渲染（查看 / 恢复 / 删除），但没有「发送到邮箱」
  await expect(page.getByRole('button', { name: '恢复', exact: true })).toHaveCount(1)
  await expect(page.getByRole('button', { name: '发送到邮箱' })).toHaveCount(0)
})
