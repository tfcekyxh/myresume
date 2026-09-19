import { expect, test, type Page } from '@playwright/test'
import { clearResumes, loginAsDefaultUser } from './helpers'
import { disconnectDb } from './db'

/**
 * 多简历：列表页的增删改与数据隔离，走真实接口。
 *
 * 每个用例前清空测试账号的全部简历，从空列表出发。
 */

test.beforeEach(async ({ page }) => {
  await loginAsDefaultUser(page)
  await clearResumes()
  await page.goto('/resumes')
})

test.afterAll(async () => {
  await disconnectDb()
})

/** 走 UI 新建一份简历，返回它的 id（新建后会自动进入编辑页）。 */
async function createViaUi(page: Page, title: string): Promise<string> {
  await page.getByRole('button', { name: '新建简历' }).first().click()
  await expect(page.locator('#resume-title')).toBeVisible()
  await page.locator('#resume-title').fill(title)
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page).toHaveURL(/\/resumes\/[^/]+\/edit/)
  return page.url().match(/\/resumes\/([^/]+)\/edit/)![1]!
}

test('没有简历时列表显示空态', async ({ page }) => {
  await expect(page.getByText('还没有简历，先建一份吧。')).toBeVisible()
})

test('新建两份简历后列表出现两条', async ({ page }) => {
  await createViaUi(page, '简历甲')
  await page.goto('/resumes')
  await createViaUi(page, '简历乙')
  await page.goto('/resumes')

  await expect(page.getByRole('listitem').filter({ hasText: '简历甲' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: '简历乙' })).toBeVisible()
})

test('重命名简历后列表标题更新', async ({ page }) => {
  await createViaUi(page, '简历甲')
  await page.goto('/resumes')

  await page
    .getByRole('listitem')
    .filter({ hasText: '简历甲' })
    .getByRole('button', { name: '重命名' })
    .click()
  await page.locator('#resume-title').fill('改名后的简历')
  await page.getByRole('button', { name: '确定', exact: true }).click()

  await expect(page.getByText('改名后的简历')).toBeVisible()
  await expect(page.getByText('简历甲')).toHaveCount(0)
})

test('删除简历后列表只剩另一份', async ({ page }) => {
  await createViaUi(page, '简历甲')
  await page.goto('/resumes')
  await createViaUi(page, '简历乙')
  await page.goto('/resumes')

  await page
    .getByRole('listitem')
    .filter({ hasText: '简历甲' })
    .getByRole('button', { name: '删除' })
    .click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()

  await expect(page.getByText('简历甲')).toHaveCount(0)
  await expect(page.getByRole('listitem').filter({ hasText: '简历乙' })).toBeVisible()
})

test('两份简历的草稿互不影响', async ({ page }) => {
  const idA = await createViaUi(page, '简历甲')
  await page.getByLabel('姓名').fill('甲的内容')
  await expect(page.getByTestId('save-status')).toHaveText('已保存')

  await page.goto('/resumes')
  const idB = await createViaUi(page, '简历乙')
  await page.getByLabel('姓名').fill('乙的内容')
  await expect(page.getByTestId('save-status')).toHaveText('已保存')

  // 各自打开编辑页，只看到自己那份的草稿
  await page.goto(`/resumes/${idA}/edit`)
  await expect(page.getByLabel('姓名')).toHaveValue('甲的内容')
  await page.goto(`/resumes/${idB}/edit`)
  await expect(page.getByLabel('姓名')).toHaveValue('乙的内容')
})

test('新建后 URL 指向该简历，刷新仍回到这份', async ({ page }) => {
  const id = await createViaUi(page, '简历甲')
  await expect(page).toHaveURL(`/resumes/${id}/edit`)

  await page.reload()
  await expect(page).toHaveURL(`/resumes/${id}/edit`)
  await expect(page.getByRole('heading', { name: '简历甲' })).toBeVisible()
})
