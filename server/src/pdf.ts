import path from 'node:path'
import { readFileSync } from 'node:fs'
import PDFDocument from 'pdfkit'
import {
  cmToPt,
  COLOR,
  FONT_SIZE_PT,
  HEADER,
  INDENT,
  ITEM_TITLE,
  LINE_SPACING,
  PAGE,
  PHOTO,
  SECTION_TITLE,
  type ExperienceItem,
  type ProjectItem,
  type ResumeData,
} from '@mymenu/shared'

/**
 * 用 PDFKit 直接绘制简历 PDF。
 *
 * 与 docx.ts 是同一套版式的两条实现：排版数值一律取自 shared 的常量表，两侧都不硬编码，
 * 改版式时两处要一起看。字体完整嵌入，收件人无需安装思源黑体。
 */

/** 字体只在模块加载时读一次，之后每次导出只解析、不再碰磁盘。 */
const FONT_DIR = path.resolve(import.meta.dirname, '../assets/fonts')
const FONT_REGULAR = readFileSync(path.join(FONT_DIR, 'NotoSansSC-Regular.ttf'))
const FONT_BOLD = readFileSync(path.join(FONT_DIR, 'NotoSansSC-Bold.ttf'))

const PAGE_W = cmToPt(PAGE.widthCm)
const PAGE_H = cmToPt(PAGE.heightCm)
const MARGIN_LEFT = cmToPt(PAGE.marginLeftCm)
/** 正文栏宽：页面宽度减去左右页边距。 */
const CONTENT_W = PAGE_W - MARGIN_LEFT - cmToPt(PAGE.marginRightCm)
/** 正文可写到的下边界。 */
const CONTENT_BOTTOM = PAGE_H - cmToPt(PAGE.marginBottomCm)

const hasText = (value: string | null | undefined): value is string =>
  (value ?? '').trim().length > 0

/**
 * 单行文本的绘制参数。
 *
 * lineBreak 关掉折行（位置由我们算好，不能再被自动换行打乱）；
 * baseline 用 alphabetic 让 y 直接表示基线，同一行里混排不同字号才不会各画各的。
 */
const SINGLE_LINE = { lineBreak: false, baseline: 'alphabetic' } as const

/**
 * 一次导出里反复用到的行高。
 *
 * PDFKit 的行高取决于「当前字体 + 当前字号」，建好文档后按各模块的字号各算一次。
 */
type Layout = {
  /** 正文（10pt）一行的高度 */
  bodyLine: number
  /** 条目标题行（12pt 粗体）的高度 */
  itemLine: number
  /** 章节标题（14pt 粗体）一行的高度 */
  titleLine: number
  /** 字体 ascender（em 比例），用于把同一行里不同字号对齐到同一基线 */
  ascender: number
}

/**
 * 行距补足值。
 *
 * PDFKit 默认按字体自身的 ascender/descender 排行，这里再补一段间距，
 * 让总行高等于「自然行高 × LINE_SPACING」——与 Word 的多倍行距同义。
 * 调用前需先设好字体与字号。
 */
function lineGapOf(doc: PDFKit.PDFDocument): number {
  return doc.currentLineHeight(true) * (LINE_SPACING - 1)
}

/** 当前字体字号下的一行高度。 */
function lineHeightOf(doc: PDFKit.PDFDocument): number {
  return doc.currentLineHeight(true) * LINE_SPACING
}

/** 切回正文样式。 */
function useBody(doc: PDFKit.PDFDocument) {
  doc.font('body').fontSize(FONT_SIZE_PT.body).fillColor(COLOR.bodyText)
}

/** 空间不够就翻页，避免章节标题孤零零落在页底。 */
function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > CONTENT_BOTTOM) doc.addPage()
}

function createLayout(doc: PDFKit.PDFDocument): Layout {
  doc.registerFont('body', FONT_REGULAR)
  doc.registerFont('bold', FONT_BOLD)

  // ascender 是公开 API 之外的值，只能读内部字段；两个字重的垂直度量一致，取正文字体即可
  doc.font('body').fontSize(FONT_SIZE_PT.body)
  const ascender = (doc as unknown as { _font: { ascender: number } })._font.ascender / 1000

  const bodyLine = lineHeightOf(doc)

  doc.font('bold').fontSize(ITEM_TITLE.fontSizePt)
  const itemLine = lineHeightOf(doc)

  doc.fontSize(SECTION_TITLE.fontSizePt)
  const titleLine = lineHeightOf(doc)

  useBody(doc)

  return { bodyLine, itemLine, titleLine, ascender }
}

/** 空行：占一行正文高度，用来分隔模块（对应 docx 里的空段落）。 */
function spacer(doc: PDFKit.PDFDocument, layout: Layout) {
  doc.y += layout.bodyLine
}

/** 正文段落：按栏宽自动折行。 */
function paragraph(
  doc: PDFKit.PDFDocument,
  text: string,
  sizePt: number = FONT_SIZE_PT.body
) {
  doc.font('body').fontSize(sizePt).fillColor(COLOR.bodyText)
  doc.text(text, MARGIN_LEFT, doc.y, { width: CONTENT_W, lineGap: lineGapOf(doc) })
}

/** 章节标题：白字黑底，下方一条 0.5pt 灰线铺满整行。 */
function sectionTitle(doc: PDFKit.PDFDocument, layout: Layout, text: string) {
  // 标题后至少要能再放两行正文，否则整块挪到下一页
  ensureSpace(doc, layout.titleLine + layout.bodyLine * 2)

  const top = doc.y
  doc.font('bold').fontSize(SECTION_TITLE.fontSizePt)

  // 黑底只盖住标题文字，与 docx 的文字底纹一致（段落底纹会铺满整行）
  const width = doc.widthOfString(text)
  doc.rect(MARGIN_LEFT, top, width, layout.titleLine).fill(SECTION_TITLE.backgroundColor)

  doc.fillColor(SECTION_TITLE.textColor)
  doc.text(text, MARGIN_LEFT, top + layout.ascender * SECTION_TITLE.fontSizePt, SINGLE_LINE)

  const borderY = top + layout.titleLine
  doc
    .moveTo(MARGIN_LEFT, borderY)
    .lineTo(MARGIN_LEFT + CONTENT_W, borderY)
    .lineWidth(SECTION_TITLE.borderSizePt)
    .strokeColor(SECTION_TITLE.borderColor)
    .stroke()

  doc.y = borderY + SECTION_TITLE.borderSizePt
  useBody(doc)
}

/**
 * 条目标题行：左侧若干栏按固定位置排开，首栏粗体，时间灰色右对齐。
 *
 * 空栏会被跳过，所以某栏没填时后面的栏会顶上来，不会留下空档（与 docx 的制表位一致）。
 */
function titleRow(
  doc: PDFKit.PDFDocument,
  layout: Layout,
  columns: (string | undefined)[],
  period?: string
) {
  const parts = columns.filter(hasText)
  if (parts.length === 0 && !hasText(period)) return

  ensureSpace(doc, layout.itemLine + layout.bodyLine)

  const top = doc.y
  const baseline = top + layout.ascender * ITEM_TITLE.fontSizePt

  doc.font('bold').fontSize(ITEM_TITLE.fontSizePt).fillColor(COLOR.bodyText)
  doc.text(parts[0] ?? '', MARGIN_LEFT, baseline, SINGLE_LINE)

  parts.slice(1).forEach((part, i) => {
    doc.font('body').fontSize(FONT_SIZE_PT.body).fillColor(COLOR.bodyText)
    doc.text(part, MARGIN_LEFT + cmToPt(ITEM_TITLE.columnStartsCm[i]), baseline, SINGLE_LINE)
  })

  if (hasText(period)) {
    doc.font('body').fontSize(FONT_SIZE_PT.body).fillColor(COLOR.timeText)
    const x = MARGIN_LEFT + CONTENT_W - doc.widthOfString(period)
    doc.text(period, x, baseline, SINGLE_LINE)
  }

  doc.y = top + layout.itemLine
  useBody(doc)
}

/**
 * 十进制编号的要点列表。
 *
 * Word 的悬挂缩进是「编号顶格、正文右移、折行与正文左边界对齐」，PDFKit 没有对应参数：
 * 这里把编号单独画在左边，正文整块从缩进位置开始排，折行自然对齐。
 */
function points(doc: PDFKit.PDFDocument, layout: Layout, list: string[]) {
  const indent = cmToPt(INDENT.listCm)

  list.filter(hasText).forEach((point, i) => {
    ensureSpace(doc, layout.bodyLine)

    const top = doc.y
    useBody(doc)
    doc.text(`${i + 1}.`, MARGIN_LEFT, top + layout.ascender * FONT_SIZE_PT.body, SINGLE_LINE)
    doc.text(point, MARGIN_LEFT + indent, top, {
      width: CONTENT_W - indent,
      lineGap: lineGapOf(doc),
    })
  })
}

function experienceBlocks(
  doc: PDFKit.PDFDocument,
  layout: Layout,
  item: ExperienceItem
) {
  // 公司在前、岗位在后，时间靠右，共三栏
  titleRow(doc, layout, [item.company, item.role], item.period)

  if (hasText(item.summary)) paragraph(doc, item.summary)
  points(doc, layout, item.points)
}

function projectBlocks(doc: PDFKit.PDFDocument, layout: Layout, item: ProjectItem) {
  // 项目名 / 项目类型 / 时间 三栏，描述与技术栈各自单独一行
  titleRow(doc, layout, [item.name, item.type], item.period)

  if (hasText(item.description)) paragraph(doc, item.description)
  if (hasText(item.techStack)) {
    doc.font('bold').fontSize(FONT_SIZE_PT.body).fillColor(COLOR.bodyText)
    doc.text('技术栈：', MARGIN_LEFT, doc.y, { width: CONTENT_W, lineGap: lineGapOf(doc), continued: true })
    doc.font('body').text(item.techStack, { width: CONTENT_W, lineGap: lineGapOf(doc) })
  }
  points(doc, layout, item.points)
}

/** 头部：左文字右证件照。docx 用无边框表格做双栏，这里用绝对定位。 */
function header(
  doc: PDFKit.PDFDocument,
  layout: Layout,
  data: ResumeData,
  photoBase64: string | null
) {
  const { basic } = data
  const top = doc.y
  const photoW = cmToPt(PHOTO.displayWidthCm)
  const photoH = cmToPt(PHOTO.displayHeightCm)
  const textW = CONTENT_W - photoW - cmToPt(HEADER.columnGapCm)

  doc.font('bold').fontSize(FONT_SIZE_PT.sectionTitle).fillColor(COLOR.bodyText)
  doc.text(basic.name, MARGIN_LEFT, top, { width: textW, lineGap: lineGapOf(doc) })

  const contact = [basic.gender, basic.age, basic.phone, basic.email].filter(hasText)
  const lines = [basic.intention, contact.join(' · ')]

  for (const line of lines) {
    if (!hasText(line)) continue
    doc.font('body').fontSize(FONT_SIZE_PT.body).fillColor(COLOR.bodyText)
    doc.text(line, MARGIN_LEFT, doc.y, { width: textW, lineGap: lineGapOf(doc) })
  }

  // 文字比照片高时以文字为准，反之以照片为准
  let bottom = doc.y
  if (photoBase64) {
    doc.image(Buffer.from(photoBase64, 'base64'), MARGIN_LEFT + CONTENT_W - photoW, top, {
      width: photoW,
      height: photoH,
    })
    bottom = Math.max(bottom, top + photoH)
  }

  doc.y = bottom
  useBody(doc)
}

function buildBody(
  doc: PDFKit.PDFDocument,
  layout: Layout,
  data: ResumeData,
  photoBase64: string | null
) {
  header(doc, layout, data, photoBase64)

  if (data.education.length > 0) {
    sectionTitle(doc, layout, '教育经历')
    for (const item of data.education) {
      titleRow(doc, layout, [item.school, item.degree, item.major], item.period)
    }
    spacer(doc, layout)
  }

  const skills = data.skills.filter((skill) => hasText(skill.text))
  if (skills.length > 0) {
    sectionTitle(doc, layout, '专业技能')
    points(
      doc,
      layout,
      skills.map((skill) => skill.text)
    )
    spacer(doc, layout)
  }

  const groups: { title: string; items: (ExperienceItem | ProjectItem)[] }[] = [
    { title: '工作经历', items: data.work },
    { title: '实习经历', items: data.internship },
    { title: '项目经历', items: data.projects },
  ]

  for (const group of groups) {
    if (group.items.length === 0) continue

    sectionTitle(doc, layout, group.title)
    group.items.forEach((item, i) => {
      if (i > 0) spacer(doc, layout)
      if (group.title === '项目经历') {
        projectBlocks(doc, layout, item as ProjectItem)
      } else {
        experienceBlocks(doc, layout, item as ExperienceItem)
      }
    })
    spacer(doc, layout)
  }

  if (hasText(data.footer)) paragraph(doc, data.footer, FONT_SIZE_PT.footer)
}

/**
 * 构建简历 PDF。
 *
 * 页面尺寸与页边距取自 shared 的常量表，不用 PDFKit 内置的 A4 预设，
 * 免得两边数值将来各改各的。
 */
export async function buildResumePdf(
  data: ResumeData,
  photoBase64: string | null
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: [PAGE_W, PAGE_H],
    margins: {
      top: cmToPt(PAGE.marginTopCm),
      bottom: cmToPt(PAGE.marginBottomCm),
      left: MARGIN_LEFT,
      right: cmToPt(PAGE.marginRightCm),
    },
  })

  const layout = createLayout(doc)
  buildBody(doc, layout, data, photoBase64)

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.end()
  })
}
