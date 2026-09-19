import { expect, type Page } from '@playwright/test'

export const USERNAME = process.env.E2E_USERNAME ?? 'liujiantao'
export const PASSWORD = process.env.E2E_PASSWORD ?? 'liujiantao'

/** 用预置账号完成登录，并等待进入编辑页。 */
export async function loginAsDefaultUser(page: Page) {
  await page.goto('/login')
  await page.getByLabel('用户名').fill(USERNAME)
  await page.getByLabel('密码').fill(PASSWORD)
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL('/edit')
}
