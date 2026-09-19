import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEmptyResumeData, FONT_CANDIDATES, type ResumeData } from '@mymenu/shared'
import { getCurrentResumeId, setDraft, setupResumeForEdit } from './helpers'
import { disconnectDb } from './db'

/**
 * docx 导出（Step 15）。
 *
 * 每个用例从「只有一份干净简历」的编辑页出发；导出走真实接口 + 浏览器下载，
 * 再用系统 unzip 解出 word/document.xml 做内容断言。
 */

test.beforeEach(async ({ page }) => {
  await setupResumeForEdit(page)
})

test.afterAll(async () => {
  await disconnectDb()
})

function sampleDraft(): ResumeData {
  const data = createEmptyResumeData()
  data.basic.name = '张三'
  data.basic.intention = '前端工程师'
  data.education.push({
    school: '示例大学',
    degree: '本科',
    major: '计算机',
    period: '2018.09 - 2022.06',
  })
  data.work.push({
    company: '示例公司',
    role: '前端工程师',
    period: '2022.07 - 至今',
    summary: '负责前端研发',
    points: ['搭建组件库'],
  })
  return data
}

function tempDocxPath(): string {
  return join(tmpdir(), `resume-export-${Date.now()}-${Math.random().toString(36).slice(2)}.docx`)
}

/** 点击「导出 Word」，等下载开始并落盘，返回建议文件名。 */
async function exportAndSave(page: Page, filePath: string): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出 Word', exact: true }).click(),
  ])
  await download.saveAs(filePath)
  return download.suggestedFilename()
}

/** 从 docx（zip）里读出 word/document.xml。 */
function readDocumentXml(filePath: string): string {
  return execFileSync('unzip', ['-p', filePath, 'word/document.xml'], { encoding: 'utf8' })
}

/** 从 docx（zip）里读出 word/styles.xml，文档级默认样式（含字体）在这里。 */
function readStylesXml(filePath: string): string {
  return execFileSync('unzip', ['-p', filePath, 'word/styles.xml'], { encoding: 'utf8' })
}

/** 列出 docx（zip）里的条目。 */
function listZipEntries(filePath: string): string {
  return execFileSync('unzip', ['-l', filePath], { encoding: 'utf8' })
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

test('导出 Word 触发下载，文件名含姓名与日期', async ({ page }) => {
  await setDraft(page, sampleDraft())
  await page.reload()
  await expect(page.getByLabel('姓名')).toHaveValue('张三')

  const filePath = tempDocxPath()
  try {
    const filename = await exportAndSave(page, filePath)
    expect(filename).toMatch(/^张三-简历-\d{4}-\d{2}-\d{2}\.docx$/)
  } finally {
    await rm(filePath, { force: true })
  }
})

test('导出的文件是含简历内容的 docx', async ({ page }) => {
  await setDraft(page, sampleDraft())
  await page.reload()

  const filePath = tempDocxPath()
  try {
    await exportAndSave(page, filePath)

    const buffer = await readFile(filePath)
    // zip 魔数 PK
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK')
    expect(buffer.byteLength).toBeGreaterThan(5 * 1024)

    const xml = readDocumentXml(filePath)
    expect(xml).toContain('张三')
    expect(xml).toContain('教育经历')
    expect(xml).toContain('示例大学')
  } finally {
    await rm(filePath, { force: true })
  }
})

test('导出的 docx 用本机已安装的候选字体', async ({ page }) => {
  await setDraft(page, sampleDraft())
  await page.reload()

  const filePath = tempDocxPath()
  try {
    await exportAndSave(page, filePath)
    const xml = readStylesXml(filePath)
    // 前端探测本机字体后由后端写进文档默认样式；只断言落在候选清单内，
    // 不断言具体是哪个，否则换台机器（mac/Windows）就挂
    expect(FONT_CANDIDATES.some((font) => xml.includes(font))).toBe(true)
  } finally {
    await rm(filePath, { force: true })
  }
})

test('导出的 docx 内嵌了证件照', async ({ page }) => {
  const photo = await makePhotoBase64(page)
  await setDraft(page, sampleDraft())
  await uploadPhotoViaApi(page, photo)
  await page.reload()

  const filePath = tempDocxPath()
  try {
    await exportAndSave(page, filePath)
    expect(listZipEntries(filePath)).toMatch(/word\/media\/[^\s]+\.(jpg|jpeg|png)/i)
  } finally {
    await rm(filePath, { force: true })
  }
})

test('导出前会先把未落库的草稿保存进去', async ({ page }) => {
  // 填完不等待自动保存（debounce 1s），立刻点导出，靠 flush 把改动带上去
  await page.getByLabel('姓名').fill('未落库姓名')

  const filePath = tempDocxPath()
  try {
    const filename = await exportAndSave(page, filePath)
    expect(filename).toContain('未落库姓名')
    expect(readDocumentXml(filePath)).toContain('未落库姓名')
  } finally {
    await rm(filePath, { force: true })
  }
})
