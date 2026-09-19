import { expect, test } from '@playwright/test'
import { USERNAME, loginAsDefaultUser } from './helpers'

test('未登录访问受保护页面会被重定向到登录页', async ({ page }) => {
  for (const path of ['/edit', '/versions', '/preview', '/']) {
    await page.goto(path)

    await expect(page).toHaveURL('/login')
    await expect(page.getByText('用预置账号登录后编辑简历')).toBeVisible()
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
  await expect(page).toHaveURL('/edit')
  await expect(page.getByRole('heading', { name: '编辑简历' })).toBeVisible()

  await page.goto('/login')
  await expect(page).toHaveURL('/edit')
})

test('登出后无法再访问受保护页面', async ({ page }) => {
  await loginAsDefaultUser(page)

  await page.getByRole('button', { name: '登出' }).click()
  await expect(page).toHaveURL('/login')

  await page.goto('/edit')
  await expect(page).toHaveURL('/login')
})

test('登录后可在编辑页与版本记录、打印预览之间导航', async ({ page }) => {
  await loginAsDefaultUser(page)

  await page.getByRole('link', { name: '版本记录' }).click()
  await expect(page).toHaveURL('/versions')
  await expect(page.getByRole('heading', { name: '版本记录' })).toBeVisible()

  await page.getByRole('link', { name: '返回编辑' }).click()
  await expect(page).toHaveURL('/edit')

  await page.getByRole('link', { name: '打印预览' }).click()
  await expect(page).toHaveURL('/preview')
  await expect(page.getByRole('heading', { name: '打印预览' })).toBeVisible()
})
