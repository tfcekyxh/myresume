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
 * 排版数值全部取自 shared 的常量表，与 /preview 页共用同一份来源，
 * 避免两条渲染路径不一致。
 */

const hasText = (value: string | null | undefined) => (value ?? '').trim().length > 0

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

/** 正文段落的通用格式：字体、行距、左右缩进。 */
function bodyRun(text: string, options: { bold?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({
    text,
    font: FONT.body,
    size: ptToHalfPoints(options.size ?? FONT_SIZE_PT.body),
    bold: options.bold,
    color: options.color ?? COLOR.bodyText,
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

/** 章节标题：白字黑底，段落下边框。 */
function sectionTitle(text: string) {
  return new Paragraph({
    spacing: { line: lineSpacingToDocxLine(LINE_SPACING) },
    shading: { type: ShadingType.CLEAR, fill: SECTION_TITLE.backgroundColor.slice(1) },
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
      }),
    ],
  })
}

/** 十进制编号的要点列表。 */
function pointParagraphs(points: string[]) {
  return points
    .filter(hasText)
    .map(
      (point) =>
        new Paragraph({
          numbering: { reference: 'resume-points', level: 0 },
          spacing: { line: lineSpacingToDocxLine(LINE_SPACING) },
          children: [bodyRun(point)],
        })
    )
}

/** 条目头一行：左侧粗体标题 + 灰色时间，用制表位右对齐时间。 */
function itemHeader(title: string, period?: string) {
  const runs = [bodyRun(title, { bold: true, size: FONT_SIZE_PT.itemTitle })]

  if (hasText(period)) {
    runs.push(
      new TextRun({
        text: `\t${period}`,
        font: FONT.body,
        size: ptToHalfPoints(FONT_SIZE_PT.body),
        color: COLOR.timeText,
      })
    )
  }

  return paragraph(runs, {
    tabStops: [{ type: 'right', position: cmToTwips(PAGE.widthCm - PAGE.marginCm * 2 - INDENT.bodyCm * 2) }],
  })
}

function experienceBlocks(item: ExperienceItem) {
  const heading = [item.role, item.company].filter(hasText).join(' · ')
  const blocks = [itemHeader(heading, item.period)]

  if (hasText(item.summary)) blocks.push(paragraph([bodyRun(item.summary ?? '')]))
  blocks.push(...pointParagraphs(item.points))

  return blocks
}

function projectBlocks(item: ProjectItem) {
  const blocks = [itemHeader(item.name, item.period)]

  if (hasText(item.description)) blocks.push(paragraph([bodyRun(item.description)]))
  if (hasText(item.techStack)) {
    blocks.push(
      paragraph([bodyRun('技术栈：', { bold: true }), bodyRun(item.techStack)])
    )
  }
  blocks.push(...pointParagraphs(item.points))

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
    columnWidths: [cmToTwips(PAGE.widthCm - PAGE.marginCm * 2 - PHOTO.displayWidthCm - 0.3), cmToTwips(PHOTO.displayWidthCm + 0.3)],
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

  if (data.education.length > 0) {
    children.push(sectionTitle('教育经历'))
    for (const item of data.education) {
      children.push(
        itemHeader(item.school, item.period),
        paragraph([bodyRun([item.degree, item.major].filter(hasText).join(' · '))])
      )
    }
  }

  const skills = data.skills.filter((skill) => hasText(skill.text))
  if (skills.length > 0) {
    children.push(sectionTitle('专业技能'))
    // 专业技能无编号
    for (const skill of skills) children.push(paragraph([bodyRun(skill.text)]))
  }

  if (data.work.length > 0) {
    children.push(sectionTitle('工作经历'))
    for (const item of data.work) children.push(...experienceBlocks(item))
  }

  if (data.internship.length > 0) {
    children.push(sectionTitle('实习经历'))
    for (const item of data.internship) children.push(...experienceBlocks(item))
  }

  if (data.projects.length > 0) {
    children.push(sectionTitle('项目经历'))
    for (const item of data.projects) children.push(...projectBlocks(item))
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

export async function buildResumeDocx(
  data: ResumeData,
  photoBase64: string | null
): Promise<Buffer> {
  const doc = new Document({
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
              top: cmToTwips(PAGE.marginCm),
              right: cmToTwips(PAGE.marginCm),
              bottom: cmToTwips(PAGE.marginCm),
              left: cmToTwips(PAGE.marginCm),
            },
          },
        },
        children: buildChildren(data, photoBase64),
      },
    ],
  })

  return Packer.toBuffer(doc)
}
