/**
 * 简历文件文字提取（全部在浏览器本地完成，文件不上传服务器）。
 *
 * - .txt / .md：直接按文本读取
 * - .docx：mammoth 提取纯文本（走包的 browser 入口）
 * - .pdf：pdfjs 逐页取文本层；扫描件 / 图片型 PDF 没有文本层，明确报错不做 OCR
 *
 * mammoth / pdfjs-dist **只能按需动态 import，不要改回顶层静态导入**：
 * 一是它们体量大、只在真的选了文件时才用得到；二是 pdfjs-dist 6.x 在模块顶层就有
 * `typeof Iterator.prototype.join !== "function"` 这类**没有 typeof 守卫**的语句，
 * 一旦跟着首屏包一起加载，没有 Iterator 全局的浏览器（Safari 16.5 / iOS 16.5）会在
 * 首屏 JS 求值时直接抛 ReferenceError，导致整个应用白屏——连登录页都打不开。
 */
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024
/** 与服务端 /api/import/parse 的入参上限一致。 */
export const MAX_IMPORT_TEXT_LENGTH = 50000
export const MIN_IMPORT_TEXT_LENGTH = 20

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown'])

/**
 * 按需加载解析库。
 *
 * 这里失败基本只有一个原因：浏览器版本过低——这两个库要求较新的运行时（见文件头注释），
 * 加载它们的模块会直接抛 ReferenceError / SyntaxError。要把这句话翻译成人能看懂的说法，
 * 而不是把 `Iterator is not defined` 甩给用户。
 */
async function loadLib<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (cause) {
    throw new Error('当前浏览器版本过低，无法在本地解析该文件，请改用直接粘贴文本', { cause })
  }
}

export async function extractResumeText(file: File): Promise<string> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error('文件不能超过 10MB')
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  if (TEXT_EXTENSIONS.has(ext)) {
    return (await file.text()).trim()
  }

  if (ext === 'docx') {
    const { default: mammoth } = await loadLib(() => import('mammoth'))
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return result.value.trim()
  }

  if (ext === 'pdf') {
    return await extractPdfText(await file.arrayBuffer())
  }

  throw new Error('仅支持 .txt、.md、.docx、.pdf 格式的文件')
}

async function extractPdfText(data: ArrayBuffer): Promise<string> {
  // 先加载 pdfjs，再进下面的 try：否则「库加载失败」会被误报成「PDF 损坏或加密」
  const pdfjsLib = await loadLib(() => import('pdfjs-dist'))
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

  let pdf: PDFDocumentProxy
  try {
    pdf = await pdfjsLib.getDocument({ data }).promise
  } catch {
    throw new Error('PDF 无法读取，可能已损坏或已加密')
  }

  const pageTexts: string[] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    pageTexts.push(
      // TextItem 才有 str，TextMarkedContent 没有；"str" in 完成类型收窄
      content.items.map((item) => ('str' in item ? item.str : '')).join('\n'),
    )
  }

  const text = pageTexts
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (text.length < MIN_IMPORT_TEXT_LENGTH) {
    throw new Error('未能从 PDF 中提取到文字，扫描件 / 图片型 PDF 暂不支持，可改为直接粘贴文本')
  }

  return text
}
