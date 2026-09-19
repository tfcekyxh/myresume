import { expect, test, type Page } from '@playwright/test'
import { createEmptyResumeData } from '@mymenu/shared'
import {
  getCurrentResumeId,
  openVersions,
  setDraft,
  setupResumeForEdit,
} from './helpers'
import { disconnectDb } from './db'

/**
 * 版本管理页（存档 / 列表 / 查看 / 恢复），走真实接口。
 *
 * 定稿语义：草稿是唯一工作区，自动保存只覆盖草稿；版本是只读快照，只在「存档」
 * 时产生，之后内容永不改变。列表顶部固定有一条「当前草稿」条目（未存档），
 * 只读展示、可查看但不可恢复。
 * 每个用例从「只有一份干净简历」出发，版本与照片天然为空。
 */

test.beforeEach(async ({ page }) => {
  await setupResumeForEdit(page)
})

test.afterAll(async () => {
  await disconnectDb()
})

/** 跳到当前简历的版本页。 */
async function goVersions(page: Page) {
  await openVersions(page, await getCurrentResumeId(page))
}

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

/** 在编辑页用「存档」按钮存一个带备注的版本（走真实 UI）。 */
async function saveVersionViaUi(page: Page, note: string) {
  await page.getByRole('button', { name: '存档', exact: true }).click()
  await expect(page.getByText('存档当前内容')).toBeVisible()
  await page.getByLabel('备注（可选）').fill(note)
  await page.getByRole('button', { name: '确认存档', exact: true }).click()
  await expect(page.getByText('存档当前内容')).not.toBeVisible()
}

/** 改姓名并等自动保存真正落库（避免只等状态条读到上一次的「已保存」）。 */
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

/** 打开版本页，点开备注为 note 的那条历史版本的「查看」弹窗，并等详情加载完。 */
async function openVersionByNote(page: Page, note: string) {
  const detailLoaded = page.waitForResponse(
    (res) =>
      res.request().method() === 'GET' &&
      /\/api\/resumes\/[^/]+\/versions\/[^/]+$/.test(new URL(res.url()).pathname) &&
      res.status() === 200
  )
  await goVersions(page)
  await page
    .getByRole('listitem')
    .filter({ hasText: note })
    .getByRole('button', { name: '查看', exact: true })
    .click()
  await detailLoaded
  await expect(page.getByText(/版本快照/)).toBeVisible()
}

/** 打开版本页，点开顶部「当前草稿」条目的「查看」弹窗。 */
async function openDraftView(page: Page) {
  await goVersions(page)
  await page
    .getByRole('listitem')
    .filter({ hasText: '当前草稿' })
    .getByRole('button', { name: '查看', exact: true })
    .click()
  await expect(page.getByText('当前草稿（未存档）')).toBeVisible()
}

test('没有存档版本时显示空状态', async ({ page }) => {
  await goVersions(page)

  await expect(
    page.getByText(
      '还没有存档版本。在编辑页点「存档」可以把当前草稿存成一个只读版本，用于回滚。'
    )
  ).toBeVisible()
})

test('版本列表展示备注，无备注显示占位文案', async ({ page }) => {
  await createVersionViaApi(page, '投递前端岗的版本')
  await createVersionViaApi(page, '')

  await goVersions(page)

  await expect(page.getByText('投递前端岗的版本')).toBeVisible()
  await expect(page.getByText('（无备注）')).toBeVisible()
  // 两条历史版本各有一个「恢复」；顶部当前草稿条目没有恢复
  await expect(page.getByRole('button', { name: '恢复', exact: true })).toHaveCount(2)
})

test('顶部「当前草稿」条目只读，查看显示最新草稿与照片', async ({ page }) => {
  const photo = await makePhotoBase64(page, '#4a6cf7')
  const draft = createEmptyResumeData()
  draft.basic.name = '最新草稿姓名'
  await setDraft(page, draft)
  await uploadPhotoViaApi(page, photo)

  await goVersions(page)

  const draftItem = page.getByRole('listitem').filter({ hasText: '当前草稿' })
  await expect(draftItem.getByText('未存档')).toBeVisible()
  await expect(draftItem.getByRole('button', { name: '恢复', exact: true })).toHaveCount(0)

  await draftItem.getByRole('button', { name: '查看', exact: true }).click()
  await expect(page.getByText('当前草稿（未存档）')).toBeVisible()
  await expect(page.getByRole('dialog').getByText('最新草稿姓名')).toBeVisible()
  await expect(page.getByRole('dialog').getByAltText('证件照')).toHaveAttribute(
    'src',
    `data:image/jpeg;base64,${photo}`
  )
})

test('存档后继续编辑，历史版本内容不变而当前草稿是最新', async ({ page }) => {
  await editNameAndWaitSaved(page, '存档时内容')
  await saveVersionViaUi(page, '存档版本')
  await editNameAndWaitSaved(page, '改后内容')

  // 历史版本停在存档那一刻
  await openVersionByNote(page, '存档版本')
  await expect(page.getByRole('dialog').getByText('存档时内容')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()

  // 顶部当前草稿查看时是最新内容
  await openDraftView(page)
  await expect(page.getByRole('dialog').getByText('改后内容')).toBeVisible()
})

test('再次存档产生新的只读版本，各版本内容互不影响', async ({ page }) => {
  await editNameAndWaitSaved(page, '第一次内容')
  await saveVersionViaUi(page, '第一条')
  await editNameAndWaitSaved(page, '第二次内容')
  await saveVersionViaUi(page, '第二条')
  await editNameAndWaitSaved(page, '第三次内容')

  await openVersionByNote(page, '第一条')
  await expect(page.getByRole('dialog').getByText('第一次内容')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()

  await openVersionByNote(page, '第二条')
  await expect(page.getByRole('dialog').getByText('第二次内容')).toBeVisible()
})

test('存档后替换照片，历史版本仍是存档时的照片', async ({ page }) => {
  const photo1 = await makePhotoBase64(page, '#111111')
  const photo2 = await makePhotoBase64(page, '#eeeeee')
  await uploadPhotoViaApi(page, photo1)
  await createVersionViaApi(page, '带照片的版本')

  await uploadPhotoViaApi(page, photo2)

  // 历史版本保留存档时的照片
  await openVersionByNote(page, '带照片的版本')
  await expect(page.getByRole('dialog').getByAltText('证件照')).toHaveAttribute(
    'src',
    `data:image/jpeg;base64,${photo1}`
  )

  // 当前草稿里是新照片
  await page.getByRole('button', { name: 'Close' }).click()
  await openDraftView(page)
  await expect(page.getByRole('dialog').getByAltText('证件照')).toHaveAttribute(
    'src',
    `data:image/jpeg;base64,${photo2}`
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

  await goVersions(page)
  await page.getByRole('button', { name: '恢复', exact: true }).click()

  await expect(page.getByText('恢复到这个版本？')).toBeVisible()
  await expect(
    page.getByText(/当前草稿的内容与照片会被这个版本覆盖/)
  ).toBeVisible()

  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByText('恢复到这个版本？')).not.toBeVisible()
  expect(restoreRequests).toHaveLength(0)
})

test('确认恢复后整页跳回编辑页', async ({ page }) => {
  await createVersionViaApi(page, '待恢复')
  const resumeId = await getCurrentResumeId(page)

  await goVersions(page)
  await page.getByRole('button', { name: '恢复', exact: true }).click()
  await page.getByRole('button', { name: '确认恢复', exact: true }).click()

  await expect(page).toHaveURL(`/resumes/${resumeId}/edit`)
})

test('恢复版本会还原它存档时的草稿内容与照片', async ({ page }) => {
  const photo1 = await makePhotoBase64(page, '#111111')
  const draftA = createEmptyResumeData()
  draftA.basic.name = '内容A'
  await setDraft(page, draftA)
  await uploadPhotoViaApi(page, photo1)
  await createVersionViaApi(page, '版本A')

  // 存档后把草稿改成内容C并换照片：版本A 是只读快照，不受影响
  const photo2 = await makePhotoBase64(page, '#eeeeee')
  const draftC = createEmptyResumeData()
  draftC.basic.name = '内容C'
  await setDraft(page, draftC)
  await uploadPhotoViaApi(page, photo2)

  const resumeId = await getCurrentResumeId(page)
  await goVersions(page)
  await page
    .getByRole('listitem')
    .filter({ hasText: '版本A' })
    .getByRole('button', { name: '恢复', exact: true })
    .click()
  await page.getByRole('button', { name: '确认恢复', exact: true }).click()
  await expect(page).toHaveURL(`/resumes/${resumeId}/edit`)

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

  await goVersions(page)
  await page.getByRole('button', { name: '恢复', exact: true }).click()
  await page.getByRole('button', { name: '确认恢复', exact: true }).click()
  await expect(page).toHaveURL(/\/resumes\/[^/]+\/edit/)

  expect(await fetchVersionCount(page)).toBe(before)
})

test('在编辑页存档会把备注保存到版本记录', async ({ page }) => {
  await saveVersionViaUi(page, '投递前端岗的版本')

  await goVersions(page)
  await expect(page.getByText('投递前端岗的版本')).toBeVisible()
})
