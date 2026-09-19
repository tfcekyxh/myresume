import { expect, test, type Page } from '@playwright/test'
import { createEmptyResumeData } from '@mymenu/shared'
import {
  clearPhoto,
  clearVersions,
  getCurrentResumeId,
  loginAsDefaultUser,
  resetDraft,
  setDraft,
} from './helpers'
import { disconnectDb } from './db'

/**
 * 版本管理页（存档 / 列表 / 查看 / 恢复），走真实接口。
 *
 * 版本与照片都会真实落库，每个用例前先清掉，保证互不影响。
 */

test.beforeEach(async ({ page }) => {
  await loginAsDefaultUser(page)
  await clearPhoto(page)
  await clearVersions(page)
  await resetDraft(page)
  await page.reload()
})

test.afterAll(async () => {
  await disconnectDb()
})

/** 生成一张纯色 JPEG 的 base64，用于构造版本照片。 */
async function makePhotoBase64(page: Page, color: string): Promise<string> {
  const dataUrl = await page.evaluate((fill) => {
    const canvas = document.createElement('canvas')
    canvas.width = 80
    canvas.height = 90
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, 80, 90)
    return canvas.toDataURL('image/jpeg', 0.8)
  }, color)
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}

/** 用真实接口预置一张照片（构造前置条件，不做断言）。 */
async function uploadPhotoViaApi(page: Page, base64: string) {
  const resumeId = await getCurrentResumeId(page)
  const res = await page.request.post(`/api/resumes/${resumeId}/photo`, {
    data: { data: base64 },
  })
  if (!res.ok()) throw new Error(`预置照片失败：${res.status()}`)
}

/** 用真实接口存一个版本（快照取服务端当前草稿与照片）。 */
async function createVersionViaApi(page: Page, note: string) {
  const resumeId = await getCurrentResumeId(page)
  const res = await page.request.post(`/api/resumes/${resumeId}/versions`, {
    data: { note },
  })
  if (!res.ok()) throw new Error(`创建版本失败：${res.status()}`)
}

/** 版本条数（走真实列表接口）。 */
async function fetchVersionCount(page: Page): Promise<number> {
  const resumeId = await getCurrentResumeId(page)
  const res = await page.request.get(`/api/resumes/${resumeId}/versions`)
  if (!res.ok()) throw new Error(`获取版本列表失败：${res.status()}`)
  return ((await res.json()) as unknown[]).length
}

test('没有版本时显示空状态', async ({ page }) => {
  await page.goto('/versions')

  await expect(
    page.getByText('还没有版本记录。在编辑页点「存档」可以把当前内容存成一个版本。')
  ).toBeVisible()
})

test('版本列表展示备注，无备注显示占位文案', async ({ page }) => {
  await createVersionViaApi(page, '投递前端岗的版本')
  await createVersionViaApi(page, '')

  await page.goto('/versions')

  await expect(page.getByText('投递前端岗的版本')).toBeVisible()
  await expect(page.getByText('（无备注）')).toBeVisible()
  await expect(page.getByRole('button', { name: '查看', exact: true })).toHaveCount(2)
})

test('查看历史版本会显示当时的简历内容与照片', async ({ page }) => {
  const photoBase64 = await makePhotoBase64(page, '#4a6cf7')
  const draft = createEmptyResumeData()
  draft.basic.name = '历史姓名'
  draft.basic.intention = '前端工程师'
  draft.education.push({
    school: '历史大学',
    degree: '本科',
    major: '计算机',
    period: '2018.09 - 2022.06',
  })

  await setDraft(page, draft)
  await uploadPhotoViaApi(page, photoBase64)
  await createVersionViaApi(page, '带照片的版本')

  await page.goto('/versions')
  await page.getByRole('button', { name: '查看', exact: true }).click()

  await expect(page.getByText(/版本快照/)).toBeVisible()
  await expect(page.getByText('历史姓名')).toBeVisible()
  await expect(page.getByText('历史大学')).toBeVisible()
  await expect(page.getByAltText('证件照')).toHaveAttribute(
    'src',
    `data:image/jpeg;base64,${photoBase64}`
  )
})

test('恢复前弹出二次确认，取消时不发出恢复请求', async ({ page }) => {
  await createVersionViaApi(page, '待恢复')

  const restoreRequests: string[] = []
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/restore')) {
      restoreRequests.push(req.url())
    }
  })

  await page.goto('/versions')
  await page.getByRole('button', { name: '恢复', exact: true }).click()

  await expect(page.getByText('恢复到这个版本？')).toBeVisible()
  await expect(page.getByText(/当前草稿的内容与照片会被这个版本覆盖/)).toBeVisible()

  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByText('恢复到这个版本？')).not.toBeVisible()
  expect(restoreRequests).toHaveLength(0)
})

test('确认恢复后整页跳回编辑页', async ({ page }) => {
  await createVersionViaApi(page, '待恢复')

  await page.goto('/versions')
  await page.getByRole('button', { name: '恢复', exact: true }).click()
  await page.getByRole('button', { name: '确认恢复', exact: true }).click()

  await expect(page).toHaveURL('/edit')
})

test('恢复版本会同时还原草稿内容与照片', async ({ page }) => {
  const photo1 = await makePhotoBase64(page, '#111111')
  const draftA = createEmptyResumeData()
  draftA.basic.name = '内容A'
  await setDraft(page, draftA)
  await uploadPhotoViaApi(page, photo1)
  await createVersionViaApi(page, '内容A的版本')

  // 存档后再改成内容 B，并换一张照片，制造「当前与版本不一致」
  const photo2 = await makePhotoBase64(page, '#eeeeee')
  const draftB = createEmptyResumeData()
  draftB.basic.name = '内容B'
  await setDraft(page, draftB)
  await uploadPhotoViaApi(page, photo2)

  await page.goto('/versions')
  await page.getByRole('button', { name: '恢复', exact: true }).click()
  await page.getByRole('button', { name: '确认恢复', exact: true }).click()
  await expect(page).toHaveURL('/edit')

  await expect(page.getByLabel('姓名')).toHaveValue('内容A')
  await expect(page.getByTestId('photo-preview').getByAltText('证件照')).toHaveAttribute(
    'src',
    `data:image/jpeg;base64,${photo1}`
  )
})

test('恢复版本不会新增版本记录', async ({ page }) => {
  await createVersionViaApi(page, '原始版本')
  const before = await fetchVersionCount(page)
  expect(before).toBe(1)

  await page.goto('/versions')
  await page.getByRole('button', { name: '恢复', exact: true }).click()
  await page.getByRole('button', { name: '确认恢复', exact: true }).click()
  await expect(page).toHaveURL('/edit')

  expect(await fetchVersionCount(page)).toBe(before)
})

test('在编辑页存档会把备注保存到版本记录', async ({ page }) => {
  await page.getByRole('button', { name: '存档', exact: true }).click()
  await expect(page.getByText('存档当前内容')).toBeVisible()

  await page.getByLabel('备注（可选）').fill('投递前端岗的版本')
  await page.getByRole('button', { name: '确认存档', exact: true }).click()
  await expect(page.getByText('存档当前内容')).not.toBeVisible()

  // 存完能在版本列表里看到这条备注
  await page.goto('/versions')
  await expect(page.getByText('投递前端岗的版本')).toBeVisible()
})
