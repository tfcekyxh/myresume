import { expect, test, type Page } from '@playwright/test'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEmptyResumeData, type ResumeData } from '@mymenu/shared'
import { setDraft, setupResumeForEdit } from './helpers'
import { disconnectDb } from './db'

/**
 * PDF 导出（Step 18 后端 + Step 19 前端按钮）。
 *
 * 每个用例从「只有一份干净简历」的编辑页出发；导出走真实接口 + 浏览器下载，
 * 再用 Node 读回落盘的 PDF 做字节级断言（字体描述符是不压缩的明文，可直接搜）。
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

function tempPdfPath(): string {
  return join(tmpdir(), `resume-export-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`)
}

/** 点击「导出 PDF」，等下载开始并落盘，返回建议文件名。 */
async function exportAndSave(page: Page, filePath: string): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出 PDF', exact: true }).click(),
  ])
  await download.saveAs(filePath)
  return download.suggestedFilename()
}

test('导出 PDF 触发下载，文件名含姓名与日期，内容是合法 PDF', async ({ page }) => {
  await setDraft(page, sampleDraft())
  await page.reload()
  await expect(page.getByLabel('姓名')).toHaveValue('张三')

  const filePath = tempPdfPath()
  try {
    const filename = await exportAndSave(page, filePath)
    expect(filename).toMatch(/^张三-简历-\d{4}-\d{2}-\d{2}\.pdf$/)

    const buffer = await readFile(filePath)
    // PDF 魔数 %PDF
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(buffer.byteLength).toBeGreaterThan(5 * 1024)
  } finally {
    await rm(filePath, { force: true })
  }
})

test('导出的 PDF 内嵌了思源黑体', async ({ page }) => {
  await setDraft(page, sampleDraft())
  await page.reload()

  const filePath = tempPdfPath()
  try {
    await exportAndSave(page, filePath)
    const buffer = await readFile(filePath)

    // 字体描述符与 BaseFont 名是不压缩的明文，可直接在字节里搜
    const text = buffer.toString('latin1')
    expect(text).toContain('FontFile2')
    expect(text).toContain('NotoSansSC')
  } finally {
    await rm(filePath, { force: true })
  }
})

test('导出前会先把未落库的草稿保存进去', async ({ page }) => {
  // 填完不等待自动保存（debounce 1s），立刻点导出，靠 flush 把改动带上去
  await page.getByLabel('姓名').fill('未落库姓名')

  const filePath = tempPdfPath()
  try {
    const filename = await exportAndSave(page, filePath)
    expect(filename).toContain('未落库姓名')
  } finally {
    await rm(filePath, { force: true })
  }
})
