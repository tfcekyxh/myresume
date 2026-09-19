import { expect, type Page } from '@playwright/test'
import { createEmptyResumeData, type ResumeData } from '@mymenu/shared'

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

/** 取当前用户唯一那份简历的 id（须先登录，复用浏览器上下文的会话）。 */
async function getCurrentResumeId(page: Page): Promise<string> {
  const res = await page.request.get('/api/resumes/current')
  if (!res.ok()) throw new Error(`获取当前简历失败：${res.status()}`)

  const body = (await res.json()) as { id: string }
  return body.id
}

/**
 * 直接写入一份草稿，仅用于构造测试前置条件（不做接口断言）。
 *
 * 草稿存库后用例之间会互相污染，因此需要干净起点的用例先调用它。
 */
export async function setDraft(page: Page, data: ResumeData) {
  const id = await getCurrentResumeId(page)
  const res = await page.request.patch(`/api/resumes/${id}/draft`, { data: { data } })
  if (!res.ok()) throw new Error(`写入草稿失败：${res.status()}`)
}

/** 把草稿重置为空（结构与 shared 的 createEmptyResumeData 一致）。 */
export async function resetDraft(page: Page) {
  await setDraft(page, createEmptyResumeData())
}
