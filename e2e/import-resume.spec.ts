import { expect, test, type Page } from '@playwright/test'
import type { ResumeData } from '@mymenu/shared'
import { setupResumeForEdit } from './helpers'

/**
 * 简历导入：粘贴文本 / 选文件 → 调 POST /api/import/parse → 预览 → 确认整体覆盖表单。
 *
 * 解析接口一律用 page.route mock，不打真实大模型。
 * 每个用例从「只有一份干净简历」的编辑页出发。
 */
const PARSE_API = '**/api/import/parse'

/** 粘贴进文本框的原始简历文本（需 >= 20 字才能点解析）。 */
const PASTED_TEXT = '张三，求职意向：前端工程师，有多年 Web 前端开发经验，熟悉 React 与 TypeScript。'

/** 通过 txt 文件在浏览器本地提取出的文本（同样 >= 20 字）。 */
const FILE_TEXT = '这是一份通过 txt 文件在浏览器本地提取出的简历：李四应聘后端工程师。'

/** mock 解析服务返回的一份完整 ResumeData，各模块都有条目。 */
const IMPORTED: ResumeData = {
  basic: {
    name: '张三',
    intention: '前端工程师',
    gender: '男',
    age: '28',
    phone: '13800138000',
    email: 'zhangsan@example.com',
  },
  education: [
    {
      school: '导入大学',
      degree: '本科',
      major: '软件工程',
      period: '2016.09 - 2020.06',
    },
  ],
  skills: [{ text: '熟悉 React 与 TypeScript' }, { text: '熟悉 Playwright 端到端测试' }],
  work: [
    {
      company: '导入科技有限公司',
      role: '前端开发工程师',
      period: '2020.07 - 至今',
      summary: '负责 Web 前端研发',
      points: ['主导前端架构升级', '搭建团队组件库'],
    },
  ],
  internship: [
    {
      company: '实习科技公司',
      role: '前端实习生',
      period: '2019.07 - 2019.09',
      points: ['参与后台管理系统开发'],
    },
  ],
  projects: [
    {
      name: '导入测试项目',
      type: '全栈项目',
      period: '2021.01 - 2021.06',
      description: '一个用于验证导入链路的项目',
      techStack: 'React / Node.js',
      points: ['完成项目初始化与部署'],
    },
  ],
  footer: '本简历由导入功能生成',
}

/**
 * 自带文本层的 PDF 里的文字（ASCII，Helvetica/WinAnsi，>= 20 字才能点解析）。
 * 用 ASCII 是为了避开 CJK 字体的编码问题，让 pdfjs 能稳定取出文本层。
 */
const PDF_TEXT = 'PDF import test resume: senior backend engineer with many years experience.'

/** 转义 PDF 字符串字面量里的特殊字符（\、括号）。 */
function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

/**
 * 手搓一份最小、合法、带文本层的 PDF（单页，Helvetica + WinAnsi，纯 ASCII）。
 * 不引入任何 PDF 生成依赖；偏移量按字符串长度算，ASCII 下字符数即字节数。
 *
 * 字号用 10 而不是更大的值：24pt 下长文本会超出 MediaBox 右边界，pdfjs / pdftotext
 * 都会丢弃跑出页面的字符（实测都在约 49 字处截断），提取结果不完整。
 */
function buildMinimalPdf(text: string): Buffer {
  const content = `BT /F1 10 Tf 72 720 Td (${escapePdfText(text)}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })

  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return Buffer.from(pdf, 'latin1')
}

/** mock 解析接口返回固定 ResumeData，不打真实大模型。 */
function mockParse(page: Page, data: ResumeData) {
  return page.route(PARSE_API, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data }),
    }),
  )
}

test.beforeEach(async ({ page }) => {
  await setupResumeForEdit(page)
})

test('粘贴文本与选择 txt 文件提取文字后解析，确认覆盖时表单整体填入并随草稿落库', async ({
  page,
}) => {
  await mockParse(page, IMPORTED)

  await page.getByTestId('import-resume-button').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('导入简历', { exact: true })).toBeVisible()

  // 路径一：直接粘贴文本
  await page.getByLabel('简历文本').fill(PASTED_TEXT)
  await expect(page.getByLabel('简历文本')).toHaveValue(PASTED_TEXT)

  // 路径二：选择 txt 文件，浏览器本地提取文字后覆盖文本框
  await page.getByTestId('import-resume-file').setInputFiles({
    name: 'resume.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(FILE_TEXT, 'utf-8'),
  })
  await expect(page.getByLabel('简历文本')).toHaveValue(FILE_TEXT)
  await expect(dialog.getByText(/已提取.*resume\.txt/)).toBeVisible()

  // 点解析：请求体就是本地提取出的文本
  const parseRequest = page.waitForRequest(PARSE_API)
  await page.getByTestId('import-parse-button').click()
  expect((await parseRequest).postDataJSON()).toEqual({ text: FILE_TEXT })

  // 预览页：姓名、求职意向与各模块条目数（顺序：教育/技能/工作/实习/项目）
  await expect(dialog.getByText('确认导入内容')).toBeVisible()
  await expect(dialog.locator('dl dd')).toHaveText([
    '张三',
    '前端工程师',
    '1 条',
    '2 条',
    '1 条',
    '1 条',
    '1 条',
  ])

  // 确认后 form.reset，草稿 debounce 1s 整体 PATCH；先挂等待再点
  const draftSaved = page.waitForResponse(
    (res) =>
      res.request().method() === 'PATCH' &&
      /\/api\/resumes\/[^/]+\/draft$/.test(res.url()) &&
      res.status() === 200,
  )
  await page.getByTestId('import-confirm-button').click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('已导入简历内容，请核对各模块字段')).toBeVisible()

  // 编辑表单被整体重置为解析结果
  await expect(page.getByLabel('姓名')).toHaveValue('张三')
  await expect(page.getByLabel('求职意向')).toHaveValue('前端工程师')
  await expect(page.getByLabel('学校')).toHaveValue('导入大学')
  await expect(page.getByLabel('页脚文字')).toHaveValue('本简历由导入功能生成')
  // 工作与实习各有一个「公司」字段，顺序为工作在前、实习在后
  await expect(page.getByLabel('公司')).toHaveCount(2)
  await expect(page.getByLabel('公司').first()).toHaveValue('导入科技有限公司')
  await expect(page.getByLabel('公司').nth(1)).toHaveValue('实习科技公司')
  await expect(page.getByText('教育经历 1')).toBeVisible()
  await expect(page.getByText('技能 1')).toBeVisible()
  await expect(page.getByText('工作经历 1')).toBeVisible()
  await expect(page.getByText('实习经历 1')).toBeVisible()
  await expect(page.getByText('项目 1')).toBeVisible()

  await draftSaved
  await expect(page.getByTestId('save-status')).toHaveText('已保存')

  // 刷新后内容仍在：导入结果已随草稿落库
  await page.reload()
  await expect(page.getByLabel('姓名')).toHaveValue('张三')
  await expect(page.getByLabel('学校')).toHaveValue('导入大学')
  await expect(page.getByText('工作经历 1')).toBeVisible()
})

test('选择自带文本层的 pdf 文件后，文字在浏览器本地提取并填入文本框，且无未捕获异常', async ({
  page,
}) => {
  // 提取走按需加载的 pdfjs chunk；解析接口仍 mock，不打真实大模型
  await mockParse(page, IMPORTED)

  // 本用例正是为「懒加载 chunk 抛 ReferenceError 导致页面崩」这类回归把关
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await page.getByTestId('import-resume-button').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('导入简历', { exact: true })).toBeVisible()

  await page.getByTestId('import-resume-file').setInputFiles({
    name: 'resume.pdf',
    mimeType: 'application/pdf',
    buffer: buildMinimalPdf(PDF_TEXT),
  })

  // 出现「已提取…」提示
  await expect(dialog.getByText(/已提取.*resume\.pdf/)).toBeVisible()
  // 浏览器本地提取出的文字被填入文本框
  await expect(page.getByLabel('简历文本')).toHaveValue(PDF_TEXT)
  // 提取到的字数足够，开始解析按钮因此可点
  await expect(page.getByTestId('import-parse-button')).toBeEnabled()

  // 全程没有未捕获异常（如 pdfjs 懒加载 chunk 在求值时抛 ReferenceError）
  expect(pageErrors).toEqual([])
})

test('取消对话框不改动表单：输入阶段取消与解析预览返回后取消均如此', async ({ page }) => {
  await mockParse(page, IMPORTED)

  // 表单里先有一份原有内容并已落库
  await page.getByLabel('姓名').fill('原有姓名')
  await expect(page.getByTestId('save-status')).toHaveText('已保存')

  // 路径一：输入阶段直接取消
  await page.getByTestId('import-resume-button').click()
  await page.getByLabel('简历文本').fill(PASTED_TEXT)
  await page.getByRole('button', { name: '取消' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('姓名')).toHaveValue('原有姓名')

  // 路径二：解析到预览页 → 返回修改（文本保留）→ 取消
  await page.getByTestId('import-resume-button').click()
  await page.getByLabel('简历文本').fill(PASTED_TEXT)
  await page.getByTestId('import-parse-button').click()
  await expect(page.getByText('确认导入内容')).toBeVisible()

  await page.getByRole('button', { name: '返回修改' }).click()
  await expect(page.getByLabel('简历文本')).toHaveValue(PASTED_TEXT)
  await page.getByRole('button', { name: '取消' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // 两种取消都没有把解析结果写进表单
  await expect(page.getByLabel('姓名')).toHaveValue('原有姓名')
  await expect(page.getByText('教育经历 1')).toHaveCount(0)
})

test('解析失败时弹窗内显示错误且文本保留，重试成功后进入预览', async ({ page }) => {
  const errorMessage = '解析服务暂时不可用，请稍后重试'
  let attempts = 0
  await page.route(PARSE_API, (route) => {
    attempts += 1
    if (attempts === 1) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: errorMessage }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: IMPORTED }),
    })
  })

  await page.getByTestId('import-resume-button').click()
  await page.getByLabel('简历文本').fill(PASTED_TEXT)
  await page.getByTestId('import-parse-button').click()

  // 错误文案展示在弹窗内，停留在输入阶段，文本保留且可重试
  await expect(page.getByText(errorMessage)).toBeVisible()
  await expect(page.getByLabel('简历文本')).toHaveValue(PASTED_TEXT)
  await expect(page.getByText('确认导入内容')).toHaveCount(0)
  await expect(page.getByTestId('import-parse-button')).toBeEnabled()

  // 第二次解析成功，进入预览页
  await page.getByTestId('import-parse-button').click()
  await expect(page.getByText('确认导入内容')).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText('张三')
})

test('文本少于 20 字或超过 50000 字时开始解析按钮禁用，合规后才可点击', async ({ page }) => {
  // 不禁用解析接口：按钮禁用期间任何请求都属于缺陷
  let parseRequests = 0
  page.on('request', (req) => {
    if (req.url().includes('/api/import/parse')) parseRequests += 1
  })

  await page.getByTestId('import-resume-button').click()
  const parseButton = page.getByTestId('import-parse-button')
  const textInput = page.getByLabel('简历文本')

  await textInput.fill('只有十几个字的简历')
  await expect(parseButton).toBeDisabled()
  await expect(page.getByText('至少输入 20 个字才能解析')).toBeVisible()

  await textInput.fill('简'.repeat(50001))
  await expect(parseButton).toBeDisabled()
  await expect(page.getByText('50001/50000 字')).toBeVisible()

  await textInput.fill(PASTED_TEXT)
  await expect(parseButton).toBeEnabled()
  expect(parseRequests).toBe(0)
})
