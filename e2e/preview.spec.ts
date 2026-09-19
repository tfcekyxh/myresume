import { expect, test, type Page } from '@playwright/test'
import { readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEmptyResumeData, type ResumeData } from '@mymenu/shared'
import { getCurrentResumeId, setDraft, setupResumeForEdit } from './helpers'
import { disconnectDb } from './db'

/**
 * 打印预览页（Step 14）。
 *
 * 屏幕态是 A4 白纸（21×29.7cm）+ 工具栏；打印态隐藏工具栏，尺寸交给 @page。
 * 每个用例从「只有一份干净简历」出发，草稿由 setDraft 构造。
 */

test.beforeEach(async ({ page }) => {
  await setupResumeForEdit(page)
})

test.afterAll(async () => {
  await disconnectDb()
})

/** 一份有内容的简历，覆盖基本信息、教育、技能、工作与要点。 */
function sampleDraft(): ResumeData {
  const data = createEmptyResumeData()
  data.basic.name = '预览姓名'
  data.basic.intention = '前端工程师'
  data.basic.phone = '13800000000'
  data.education.push({
    school: '预览大学',
    degree: '本科',
    major: '计算机',
    period: '2018.09 - 2022.06',
  })
  data.skills.push({ text: 'TypeScript / React' })
  data.work.push({
    company: '某科技公司',
    role: '前端工程师',
    period: '2022.07 - 至今',
    summary: '负责 Web 端研发',
    points: ['负责前端架构', '搭建组件库'],
  })
  return data
}

/** 进入当前简历的打印预览页，等工具栏出现。 */
async function openPreview(page: Page) {
  const resumeId = await getCurrentResumeId(page)
  await page.goto(`/resumes/${resumeId}/preview`)
  await expect(page.getByRole('button', { name: '打印 / 导出 PDF' })).toBeVisible()
}

/** 页面里生成一张小 JPEG 的 base64。 */
async function makePhotoBase64(page: Page): Promise<string> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 80
    canvas.height = 90
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#4a6cf7'
    ctx.fillRect(0, 0, 80, 90)
    return canvas.toDataURL('image/jpeg', 0.8)
  })
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}

/** 用真实接口给当前简历预置一张照片。 */
async function uploadPhotoViaApi(page: Page, base64: string) {
  const resumeId = await getCurrentResumeId(page)
  const res = await page.request.post(`/api/resumes/${resumeId}/photo`, {
    data: { data: base64 },
  })
  if (!res.ok()) throw new Error(`预置照片失败：${res.status()}`)
}

test('预览页展示简历内容与打印工具栏', async ({ page }) => {
  await setDraft(page, sampleDraft())
  await openPreview(page)

  await expect(page.getByText('预览姓名')).toBeVisible()
  await expect(page.getByText('教育经历')).toBeVisible()
  await expect(page.getByText('预览大学')).toBeVisible()
  await expect(page.getByText('工作经历')).toBeVisible()
  await expect(page.getByText('负责前端架构')).toBeVisible()

  await expect(page.getByRole('link', { name: '返回编辑' })).toBeVisible()
  await expect(page.getByRole('button', { name: '打印 / 导出 PDF' })).toBeVisible()
})

test('打印态隐藏工具栏但保留简历内容', async ({ page }) => {
  await setDraft(page, sampleDraft())
  await openPreview(page)

  await page.emulateMedia({ media: 'print' })

  await expect(page.getByRole('link', { name: '返回编辑' })).toBeHidden()
  await expect(page.getByRole('button', { name: '打印 / 导出 PDF' })).toBeHidden()
  await expect(page.getByText('预览姓名')).toBeVisible()
  await expect(page.getByText('工作经历')).toBeVisible()
})

test('屏幕态内容容器宽度为 A4 的 21cm', async ({ page }) => {
  await setDraft(page, sampleDraft())
  await openPreview(page)

  const sheet = page.locator('div[class*="min-h-(--page-height)"]')
  await expect(sheet).toBeVisible()

  const box = await sheet.boundingBox()
  expect(box).not.toBeNull()
  // 21cm ≈ 793.7px（CSS 1cm = 96/2.54 px），允许几像素误差
  expect(Math.abs(box!.width - 793.7)).toBeLessThan(5)
})

test('预览里的证件照按 1.98×2.2cm 渲染', async ({ page }) => {
  const photo = await makePhotoBase64(page)
  await setDraft(page, sampleDraft())
  await uploadPhotoViaApi(page, photo)
  await openPreview(page)

  const img = page.getByAltText('证件照')
  await expect(img).toBeVisible()

  const box = await img.boundingBox()
  expect(box).not.toBeNull()
  // 1.98cm ≈ 74.8px，2.2cm ≈ 83.1px
  expect(Math.abs(box!.width - 74.8)).toBeLessThan(3)
  expect(Math.abs(box!.height - 83.1)).toBeLessThan(3)
})

test('导出 PDF：内容不多时为 1 页', async ({ page }) => {
  await setDraft(page, sampleDraft())
  await openPreview(page)

  const pdfPath = join(tmpdir(), `resume-preview-${Date.now()}.pdf`)
  try {
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true })

    const info = await stat(pdfPath)
    expect(info.size).toBeGreaterThan(1000)

    // Chromium 生成的 PDF 页树里 /Count 即总页数
    const raw = (await readFile(pdfPath)).toString('latin1')
    const counts = [...raw.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]))
    expect(counts.length).toBeGreaterThan(0)
    expect(Math.max(...counts)).toBe(1)
  } finally {
    await rm(pdfPath, { force: true })
  }
})
