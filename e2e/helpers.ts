import { expect, type Page } from '@playwright/test'
import { createEmptyResumeData, type ResumeData } from '@mymenu/shared'

// 专用测试账号，由 e2e/global-setup.ts 确保存在。
// 用例会清空该账号的简历，绝不能换成真实账号。
export const USERNAME = process.env.E2E_USERNAME ?? 'e2e-tester'
export const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-tester'

/** 用预置账号登录，等待落到简历列表页（登录后先进 /resumes 选简历）。 */
export async function loginAsDefaultUser(page: Page) {
  // 每个用例都会登录，不清限流计数的话，跑到后面就会被自己的登录限流挡住
  const { clearRateLimits } = await import('./db')
  await clearRateLimits()

  await page.goto('/login')
  await page.getByLabel('用户名').fill(USERNAME)
  await page.getByLabel('密码').fill(PASSWORD)
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL('/resumes')
}

/** 删除测试账号全部简历（照片、版本随外键级联删除），保证干净起点。 */
export async function clearResumes() {
  const { clearResumesForUser } = await import('./db')
  await clearResumesForUser(USERNAME)
}

type ResumeListItem = { id: string; title: string; updatedAt: string }

/** 取测试账号当前所有简历（必须已登录）。 */
export async function listResumes(page: Page): Promise<ResumeListItem[]> {
  const res = await page.request.get('/api/resumes')
  if (!res.ok()) throw new Error(`获取简历列表失败：${res.status()}`)
  return (await res.json()) as ResumeListItem[]
}

/** 新建一份简历并返回 id（构造前置数据）。 */
export async function createResume(page: Page, title: string): Promise<string> {
  const res = await page.request.post('/api/resumes', { data: { title } })
  if (!res.ok()) throw new Error(`创建简历失败：${res.status()}`)
  return ((await res.json()) as ResumeListItem).id
}

/** 取「当前」简历 id：取第一份，一份都没有就建一份默认名称的。 */
export async function getCurrentResumeId(page: Page): Promise<string> {
  const resumes = await listResumes(page)
  if (resumes.length > 0) return resumes[0]!.id
  return createResume(page, '简历')
}

/** 直接跳到某份简历的编辑页（走真实路由）。 */
export async function openEdit(page: Page, resumeId: string) {
  await page.goto(`/resumes/${resumeId}/edit`)
  await expect(page.getByRole('button', { name: '存档', exact: true })).toBeVisible()
}

/** 直接跳到某份简历的版本页。 */
export async function openVersions(page: Page, resumeId: string) {
  await page.goto(`/resumes/${resumeId}/versions`)
  await expect(page.getByText('已归档的简历版本')).toBeVisible()
}

/** 对指定简历写草稿（构造前置数据）。 */
export async function setDraftFor(page: Page, resumeId: string, data: ResumeData) {
  const res = await page.request.patch(`/api/resumes/${resumeId}/draft`, { data: { data } })
  if (!res.ok()) throw new Error(`写入草稿失败：${res.status()}`)
}

/** 对「当前」简历写草稿（第一份）。 */
export async function setDraft(page: Page, data: ResumeData) {
  const id = await getCurrentResumeId(page)
  await setDraftFor(page, id, data)
}

/** 把「当前」简历的草稿重置为空。 */
export async function resetDraft(page: Page) {
  await setDraft(page, createEmptyResumeData())
}

/**
 * 常见前置：登录 → 清空全部简历 → 建一份 → 进入它的编辑页。
 *
 * 多简历之后每个用例都从「只有一份干净简历」出发，避免互相污染。
 * 之后用 getCurrentResumeId(page) 拿这份简历的 id（此时只有一份）。
 */
export async function setupResumeForEdit(page: Page, title = '测试简历') {
  await loginAsDefaultUser(page)
  await clearResumes()
  const id = await createResume(page, title)
  await openEdit(page, id)
}