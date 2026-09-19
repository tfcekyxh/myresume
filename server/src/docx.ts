import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphOptions,
} from 'docx'
import {
  COLOR,
  FONT,
  FONT_SIZE_PT,
  INDENT,
  ITEM_TITLE,
  LINE_SPACING,
  PAGE,
  PHOTO,
  SECTION_TITLE,
  cmToTwips,
  lineSpacingToDocxLine,
  ptToHalfPoints,
  type ExperienceItem,
  type ProjectItem,
  type ResumeData,
} from '@mymenu/shared'

/**
 * 用 docx 库以代码构建简历文档。
 *
 * 排版数值全部取自 shared 的常量表，导出后由 Word 渲染，
 * 是简历版式的唯一权威输出。
 */

const hasText = (value: string | null | undefined): value is string =>
  (value ?? '').trim().length > 0

/** docx 的图片尺寸按 96 DPI 的像素算，这里把 cm 换算过去。 */
const cmToPx = (cm: number) => Math.round((cm / 2.54) * 96)

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
} as const

/**
 * 正文段落的通用格式：字号、行距、左右缩进。
 *
 * 字体不在这里指定，由文档级默认样式统一下发（见 buildResumeDocx 的 fontFamily）。
 * shading 是文字底纹（只盖住文字本身），段落底纹会铺满整行，这里不用。
 */
function bodyRun(
  text: string,
  options: { bold?: boolean; size?: number; color?: string; shading?: string } = {}
) {
  return new TextRun({
    text,
    size: ptToHalfPoints(options.size ?? FONT_SIZE_PT.body),
    bold: options.bold,
    color: options.color ?? COLOR.bodyText,
    shading: options.shading
      ? { type: ShadingType.CLEAR, fill: options.shading.slice(1) }
      : undefined,
  })
}

function paragraph(
  children: TextRun[],
  extra: Partial<IParagraphOptions> = {}
): Paragraph {
  return new Paragraph({
    spacing: { line: lineSpacingToDocxLine(LINE_SPACING) },
    indent: { left: cmToTwips(INDENT.bodyCm), right: cmToTwips(INDENT.bodyCm) },
    ...extra,
    children,
  })
}

/** 章节之间的空行：占一行高度、无内容。 */
function spacer() {
  return new Paragraph({
    spacing: { line: lineSpacingToDocxLine(LINE_SPACING) },
    children: [],
  })
}

/**
 * 章节标题：白字黑底，段落下边框。
 *
 * 黑底用文字底纹，只盖住标题文字；下边框挂在段落上，铺满整行。
 */
function sectionTitle(text: string) {
  return new Paragraph({
    spacing: { line: lineSpacingToDocxLine(LINE_SPACING) },
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: 4,
        color: SECTION_TITLE.borderColor.slice(1),
      },
    },
    children: [
      bodyRun(text, {
        bold: true,
        size: SECTION_TITLE.fontSizePt,
        color: SECTION_TITLE.textColor,
        shading: SECTION_TITLE.backgroundColor,
      }),
    ],
  })
}

/**
 * 十进制编号的要点列表。
 *
 * instance 让每条经历用自己的编号实例，编号各自从 1 开始；
 * 共用同一个 reference 的话，Word 会把全文的要点连起来数成 1…N。
 */
function pointParagraphs(points: string[], instance: number) {
  return points
    .filter(hasText)
    .map(
      (point) =>
        new Paragraph({
          numbering: { reference: 'resume-points', level: 0, instance },
          spacing: { line: lineSpacingToDocxLine(LINE_SPACING) },
          children: [bodyRun(point)],
        })
    )
}

/** 正文栏宽（页面宽度减去左右页边距）。 */
const CONTENT_WIDTH_CM = PAGE.widthCm - PAGE.marginLeftCm - PAGE.marginRightCm

/** 灰色时间文字。 */
function timeRun(text: string) {
  return new TextRun({
    text,
    size: ptToHalfPoints(FONT_SIZE_PT.body),
    color: COLOR.timeText,
  })
}

/**
 * 条目标题行：左侧若干栏用制表位排开，首栏粗体，时间用右制表位靠右。
 *
 * 空栏会被跳过，所以某栏没填时后面的栏会顶上来，不会留下空档。
 */
function titleRow(columns: (string | undefined)[], period?: string) {
  const parts = columns.filter(hasText)
  const runs = [bodyRun(parts[0] ?? '', { bold: true, size: FONT_SIZE_PT.itemTitle })]

  for (const part of parts.slice(1)) runs.push(bodyRun(`\t${part}`))
  if (hasText(period)) runs.push(timeRun(`\t${period}`))

  return paragraph(runs, {
    tabStops: [
      ...ITEM_TITLE.columnStartsCm.slice(0, parts.length - 1).map((cm) => ({
        type: 'left' as const,
        position: cmToTwips(cm),
      })),
      { type: 'right', position: cmToTwips(CONTENT_WIDTH_CM) },
    ],
  })
}

function experienceBlocks(item: ExperienceItem, instance: number) {
  // 公司在前、岗位在后，时间靠右，共三栏
  const blocks = [titleRow([item.company, item.role], item.period)]

  if (hasText(item.summary)) blocks.push(paragraph([bodyRun(item.summary ?? '')]))
  blocks.push(...pointParagraphs(item.points, instance))

  return blocks
}

function projectBlocks(item: ProjectItem, instance: number) {
  // 项目名 / 项目类型 / 时间 三栏，描述与技术栈各自单独一行
  const blocks = [titleRow([item.name, item.type], item.period)]

  if (hasText(item.description)) blocks.push(paragraph([bodyRun(item.description)]))
  if (hasText(item.techStack)) {
    blocks.push(
      paragraph([bodyRun('技术栈：', { bold: true }), bodyRun(item.techStack)])
    )
  }
  blocks.push(...pointParagraphs(item.points, instance))

  return blocks
}

/** 头部：左文字右证件照，用无边框表格做双栏（原文档用制表位，这里不复刻）。 */
function headerTable(data: ResumeData, photoBase64: string | null) {
  const { basic } = data
  const contact = [basic.gender, basic.age, basic.phone, basic.email].filter(hasText)

  const left: Paragraph[] = [
    new Paragraph({
      spacing: { line: lineSpacingToDocxLine(LINE_SPACING) },
      children: [bodyRun(basic.name, { bold: true, size: FONT_SIZE_PT.sectionTitle })],
    }),
  ]
  if (hasText(basic.intention)) left.push(paragraph([bodyRun(basic.intention)]))
  if (contact.length > 0) left.push(paragraph([bodyRun(contact.join(' · '))]))

  const right: Paragraph[] = []

  if (photoBase64) {
    right.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new ImageRun({
            type: 'jpg',
            data: Buffer.from(photoBase64, 'base64'),
            transformation: {
              width: cmToPx(PHOTO.displayWidthCm),
              height: cmToPx(PHOTO.displayHeightCm),
            },
          }),
        ],
      })
    )
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    columnWidths: [cmToTwips(PAGE.widthCm - PAGE.marginLeftCm - PAGE.marginRightCm - PHOTO.displayWidthCm - 0.3), cmToTwips(PHOTO.displayWidthCm + 0.3)],
    rows: [
      new TableRow({
        children: [
          new TableCell({ children: left, borders: NO_BORDERS }),
          new TableCell({ children: right, borders: NO_BORDERS }),
        ],
      }),
    ],
  })
}

function buildChildren(data: ResumeData, photoBase64: string | null) {
  const children: (Paragraph | Table)[] = [headerTable(data, photoBase64)]

  // 每条经历的要点用独立的编号实例，编号从 1 重新开始
  let numberingInstance = 1

  if (data.education.length > 0) {
    children.push(sectionTitle('教育经历'))
    for (const item of data.education) {
      children.push(titleRow([item.school, item.degree, item.major], item.period))
    }
    children.push(spacer())
  }

  const skills = data.skills.filter((skill) => hasText(skill.text))
  if (skills.length > 0) {
    children.push(sectionTitle('专业技能'))
    children.push(...pointParagraphs(skills.map((skill) => skill.text), numberingInstance++))
    children.push(spacer())
  }

  if (data.work.length > 0) {
    children.push(sectionTitle('工作经历'))
    data.work.forEach((item, i) => {
      if (i > 0) children.push(spacer())
      children.push(...experienceBlocks(item, numberingInstance++))
    })
    children.push(spacer())
  }

  if (data.internship.length > 0) {
    children.push(sectionTitle('实习经历'))
    data.internship.forEach((item, i) => {
      if (i > 0) children.push(spacer())
      children.push(...experienceBlocks(item, numberingInstance++))
    })
    children.push(spacer())
  }

  if (data.projects.length > 0) {
    children.push(sectionTitle('项目经历'))
    data.projects.forEach((item, i) => {
      if (i > 0) children.push(spacer())
      children.push(...projectBlocks(item, numberingInstance++))
    })
    children.push(spacer())
  }

  if (hasText(data.footer)) {
    children.push(
      paragraph([bodyRun(data.footer, { size: FONT_SIZE_PT.footer })], {
        alignment: AlignmentType.LEFT,
      })
    )
  }

  return children
}

/**
 * 构建简历 docx。
 *
 * fontFamily 由前端探测本机已安装的字体后传入；docx 里写字符串字体名会同时作用于
 * ascii / hAnsi / eastAsia / cs，中英文都跟着变。走文档级默认样式，避免逐个 run 指定。
 */
export async function buildResumeDocx(
  data: ResumeData,
  photoBase64: string | null,
  fontFamily: string = FONT.body
): Promise<Buffer> {
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: fontFamily } },
      },
    },
    numbering: {
      config: [
        {
          reference: 'resume-points',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: {
                    left: cmToTwips(INDENT.listCm),
                    hanging: cmToTwips(INDENT.listHangingCm),
                  },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: cmToTwips(PAGE.widthCm),
              height: cmToTwips(PAGE.heightCm),
            },
            margin: {
              top: cmToTwips(PAGE.marginTopCm),
              right: cmToTwips(PAGE.marginRightCm),
              bottom: cmToTwips(PAGE.marginBottomCm),
              left: cmToTwips(PAGE.marginLeftCm),
              footer: cmToTwips(PAGE.footerDistanceCm),
            },
          },
        },
        children: buildChildren(data, photoBase64),
      },
    ],
  })

  return Packer.toBuffer(doc)
}
