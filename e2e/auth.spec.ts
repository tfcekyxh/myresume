import { expect, test } from '@playwright/test'
import {
  USERNAME,
  PASSWORD,
  clearResumes,
  loginAsDefaultUser,
  openEdit,
  createResume,
} from './helpers'

// 有「用错密码登录」的用例，登录限流是 15 分钟 10 次，从零开始才稳
test.beforeEach(async () => {
  const { clearRateLimits } = await import('./db')
  await clearRateLimits()
})

test('未登录访问受保护页面会被重定向到登录页', async ({ page }) => {
  for (const path of ['/resumes', '/resumes/abc/edit', '/resumes/abc/versions', '/']) {
    await page.goto(path)

    await expect(page).toHaveURL('/login')
    await expect(page.getByText('登录后编辑简历')).toBeVisible()
  }
})

test('登录表单校验与错误提示', async ({ page }) => {
  await page.goto('/login')

  // 空表单提交提示必填
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page.getByText('请输入用户名')).toBeVisible()
  await expect(page.getByText('请输入密码')).toBeVisible()

  // 密码错误提示
  await page.getByLabel('用户名').fill(USERNAME)
  await page.getByLabel('密码').fill('definitely-wrong-password')
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page.getByText('用户名或密码错误')).toBeVisible()
  await expect(page).toHaveURL('/login')
})

test('登录成功后可编辑，会话在刷新与重访登录页时保持', async ({ page }) => {
  await loginAsDefaultUser(page)
  await expect(page.getByText(USERNAME)).toBeVisible()

  await page.reload()
  await expect(page).toHaveURL('/resumes')
  await expect(page.getByRole('heading', { name: '我的简历' })).toBeVisible()

  await page.goto('/login')
  await expect(page).toHaveURL('/resumes')
})

test('登出后无法再访问受保护页面', async ({ page }) => {
  await loginAsDefaultUser(page)

  await page.getByRole('button', { name: '登出' }).click()
  await expect(page).toHaveURL('/login')

  await page.goto('/resumes')
  await expect(page).toHaveURL('/login')
})

test('登录默认进入最近编辑的简历', async ({ page }) => {
  await loginAsDefaultUser(page)
  await clearResumes()
  const edited = await createResume(page, '前端简历')
  await createResume(page, '后端简历')
  await openEdit(page, edited)

  await page.getByRole('button', { name: '登出' }).click()
  await expect(page).toHaveURL('/login')

  await page.getByLabel('用户名').fill(USERNAME)
  await page.getByLabel('密码').fill(PASSWORD)
  await page.getByRole('button', { name: '登录' }).click()

  await expect(page).toHaveURL(`/resumes/${edited}/edit`)
})

test('登录后可在编辑页与版本记录之间导航', async ({ page }) => {
  await loginAsDefaultUser(page)
  await clearResumes()
  const resumeId = await createResume(page, '测试简历')
  await openEdit(page, resumeId)

  await page.getByRole('link', { name: '已归档的简历版本' }).click()
  await expect(page).toHaveURL(`/resumes/${resumeId}/versions`)
  await expect(page.getByText('已归档的简历版本')).toBeVisible()

  await page.getByRole('link', { name: '正在编辑' }).click()
  await expect(page).toHaveURL(`/resumes/${resumeId}/edit`)
})
