import { expect, test } from '@playwright/test'
import { createEmptyResumeData } from '@mymenu/shared'
import { loginAsDefaultUser, resetDraft, setDraft } from './helpers'

const DRAFT_PATCH = '**/api/resumes/*/draft'

// 自动保存会把内容写进库，用例之间必须从同一份空草稿开始
test.beforeEach(async ({ page }) => {
  await loginAsDefaultUser(page)
  await resetDraft(page)
  await page.reload()
})

test('修改内容后先显示保存中再显示已保存，刷新后内容仍在', async ({ page }) => {
  // 放慢保存响应，确保能稳定观察到「保存中…」这一中间态
  await page.route(DRAFT_PATCH, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    await route.continue()
  })

  const status = page.getByTestId('save-status')
  // 初始 idle 时状态条不渲染
  await expect(status).toHaveCount(0)

  await page.getByLabel('姓名').fill('自动保存')
  await expect(status).toHaveText('保存中…')
  await expect(status).toHaveText('已保存')

  await page.reload()
  await expect(page.getByLabel('姓名')).toHaveValue('自动保存')
})

test('新增条目后自动保存，刷新后条目仍在', async ({ page }) => {
  await page.getByRole('button', { name: '添加教育经历' }).click()
  await page.getByLabel('学校').fill('持久化大学')
  await expect(page.getByTestId('save-status')).toHaveText('已保存')

  await page.reload()
  await expect(page.getByLabel('学校')).toHaveCount(1)
  await expect(page.getByLabel('学校')).toHaveValue('持久化大学')
})

test('打开编辑页会加载库里已有的草稿内容', async ({ page }) => {
  const draft = createEmptyResumeData()
  draft.basic.name = '库里已有'
  draft.basic.intention = '后端工程师'
  draft.education.push({
    school: '草稿大学',
    degree: '本科',
    major: '计算机',
    period: '2018.09 - 2022.06',
  })
  await setDraft(page, draft)

  // 整页重新加载，走 ResumeGate 拉取并初始化表单这条链路
  await page.goto('/edit')

  await expect(page.getByLabel('姓名')).toHaveValue('库里已有')
  await expect(page.getByLabel('求职意向')).toHaveValue('后端工程师')
  await expect(page.getByLabel('学校')).toHaveValue('草稿大学')
  await expect(page.getByLabel('专业')).toHaveValue('计算机')
})

test('保存失败时显示失败提示', async ({ page }) => {
  await page.route(DRAFT_PATCH, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: '服务器内部错误' }),
    })
  )

  await page.getByLabel('姓名').fill('保存会失败')
  await expect(page.getByTestId('save-status')).toHaveText('保存失败，下次修改时会重试')
})

test('关闭页面时补发未落库的改动', async ({ page, context }) => {
  await page.getByLabel('姓名').fill('离页补发')

  // 不等 debounce（1s），直接关页面，触发 pagehide 的 keepalive 补发
  await page.close()

  const reopened = await context.newPage()
  await reopened.goto('/edit')
  await expect(reopened.getByLabel('姓名')).toHaveValue('离页补发')
})
