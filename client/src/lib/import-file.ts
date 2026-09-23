/**
 * 简历文件文字提取（全部在浏览器本地完成，文件不上传服务器）。
 *
 * - .txt / .md：直接按文本读取
 * - .docx：mammoth 提取纯文本（走包的 browser 入口）
 * - .pdf：pdfjs 逐页取文本层；扫描件 / 图片型 PDF 没有文本层，明确报错不做 OCR
 */
import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024
/** 与服务端 /api/import/parse 的入参上限一致。 */
export const MAX_IMPORT_TEXT_LENGTH = 50000
export const MIN_IMPORT_TEXT_LENGTH = 20

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown'])

export async function extractResumeText(file: File): Promise<string> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error('文件不能超过 10MB')
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  if (TEXT_EXTENSIONS.has(ext)) {
    return (await file.text()).trim()
  }

  if (ext === 'docx') {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return result.value.trim()
  }

  if (ext === 'pdf') {
    return await extractPdfText(await file.arrayBuffer())
  }

  throw new Error('仅支持 .txt、.md、.docx、.pdf 格式的文件')
}

async function extractPdfText(data: ArrayBuffer): Promise<string> {
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
