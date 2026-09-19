/**
 * 简历排版常量。
 *
 * 前端 CSS 与后端 docx 生成共用这一份，改样式只改这里，禁止在两侧硬编码数值。
 * 数值提取自现有 Word 简历（20260913.docx），说明见 tech-stack.md 的「样式来源」。
 *
 * 单位约定：常量以 cm / pt 书写（人能看懂、CSS 直接用），
 * docx 需要的 twips 与半磅值由下方换算函数派生，避免维护两套数字。
 */

// ---------- 单位换算 ----------

/** 1 pt = 20 twips（1 inch = 1440 twips）。 */
export const TWIPS_PER_PT = 20

/** 1 cm ≈ 566.93 twips。 */
export const TWIPS_PER_CM = 1440 / 2.54

/** cm → twips，docx 库要求整数。 */
export function cmToTwips(cm: number): number {
  return Math.round(cm * TWIPS_PER_CM)
}

/** pt → twips。 */
export function ptToTwips(pt: number): number {
  return Math.round(pt * TWIPS_PER_PT)
}

/** pt → docx 的半磅值（`size` / `sz` 字段以半磅为单位）。 */
export function ptToHalfPoints(pt: number): number {
  return Math.round(pt * 2)
}

/** 行距倍数 → docx 的 `line` 值（单倍行距为 240）。 */
export function lineSpacingToDocxLine(multiple: number): number {
  return Math.round(240 * multiple)
}

// ---------- 页面 ----------

export const PAGE = {
  /** A4 */
  widthCm: 21,
  heightCm: 29.7,
  /** 页边距：四边一致，1.5cm */
  marginTopCm: 1.5,
  marginBottomCm: 1.5,
  marginLeftCm: 1.5,
  marginRightCm: 1.5,
  /** 页脚距页面底边 */
  footerDistanceCm: 2.6,
} as const

// ---------- 字体 ----------

export const FONT = {
  /** docx 用的字体名：等线 */
  body: 'DengXian',
  /** 网页用的完整回退链 */
  webFamily: "DengXian, 等线, 'Microsoft YaHei', 'PingFang SC', sans-serif",
} as const

export const FONT_SIZE_PT = {
  body: 10,
  sectionTitle: 14,
  itemTitle: 12,
  footer: 9,
} as const

export const LINE_SPACING = 1.1

// ---------- 缩进 ----------

export const INDENT = {
  /** 正文段落左右缩进：0 表示顶格 */
  bodyCm: 0,
  /** 要点列表正文缩进 */
  listCm: 0.35,
  /** 要点列表悬挂缩进：与 listCm 相等，编号才能顶格 */
  listHangingCm: 0.35,
} as const

// ---------- 颜色 ----------

export const COLOR = {
  bodyText: '#000000',
  sectionTitleText: '#FFFFFF',
  sectionTitleBackground: '#000000',
  sectionTitleBorder: '#D9D9D9',
  timeText: '#7F7F7F',
} as const

// ---------- 各模块样式 ----------

/** 章节标题：白字黑底，段落下边框 0.5 pt。 */
export const SECTION_TITLE = {
  fontSizePt: FONT_SIZE_PT.sectionTitle,
  bold: true,
  textColor: COLOR.sectionTitleText,
  backgroundColor: COLOR.sectionTitleBackground,
  borderSizePt: 0.5,
  borderColor: COLOR.sectionTitleBorder,
} as const

/** 条目标题行（公司 / 项目名那行）。 */
export const ITEM_TITLE = {
  fontSizePt: FONT_SIZE_PT.itemTitle,
  bold: true,
} as const

/** 时间文字，灰色。 */
export const TIME_TEXT = {
  color: COLOR.timeText,
} as const

/** 要点列表：十进制编号「1.」，带悬挂缩进。专业技能不用编号。 */
export const BULLET_LIST = {
  numbering: 'decimal',
  indentCm: INDENT.listCm,
  hangingCm: INDENT.listHangingCm,
} as const

/** 页脚。 */
export const FOOTER = {
  fontSizePt: FONT_SIZE_PT.footer,
  align: 'left',
} as const

/** 头部布局：双栏，左文字右证件照。原文档用制表位实现，这里改用弹性布局，不复刻制表位。 */
export const HEADER = {
  columnGapCm: 0.75,
} as const

/**
 * 证件照：显示尺寸与压缩参数。前端压缩与后端 docx 导出共用。
 *
 * 像素尺寸由显示尺寸与 DPI 推导（见下方 PHOTO_PIXEL_*），
 * 不要另填一套「标准一寸照 295×413」之类的值——那个比例是 0.714，
 * 与这里的 1.98:2.2 = 0.9 不同，压缩后插入会横向拉伸。
 */
export const PHOTO = {
  displayWidthCm: 1.98,
  displayHeightCm: 2.2,
  /** 压缩目标密度，300 DPI 打印足够清晰 */
  dpi: 300,
  jpegQuality: 0.85,
  /** base64 字节数上限，超限由后端拒绝 */
  maxBase64Bytes: 500 * 1024,
} as const

/** 压缩后的目标像素尺寸，比例与显示尺寸一致。 */
export const PHOTO_PIXEL_WIDTH = Math.round((PHOTO.displayWidthCm / 2.54) * PHOTO.dpi)
export const PHOTO_PIXEL_HEIGHT = Math.round((PHOTO.displayHeightCm / 2.54) * PHOTO.dpi)

// ---------- 前端 CSS 变量 ----------

/**
 * 供前端把常量注入为 CSS 变量，在 A4 预览容器上 `style={RESUME_CSS_VARS}` 展开。
 * CSS 里只引用 `var(--resume-*)`，不写字面值。
 */
export const RESUME_CSS_VARS = {
  '--resume-page-width': `${PAGE.widthCm}cm`,
  '--resume-page-height': `${PAGE.heightCm}cm`,
  '--resume-font-family': FONT.webFamily,
  '--resume-font-size-body': `${FONT_SIZE_PT.body}pt`,
  '--resume-font-size-section-title': `${FONT_SIZE_PT.sectionTitle}pt`,
  '--resume-font-size-item-title': `${FONT_SIZE_PT.itemTitle}pt`,
  '--resume-font-size-footer': `${FONT_SIZE_PT.footer}pt`,
  '--resume-line-height': `${LINE_SPACING}`,
  '--resume-indent-body': `${INDENT.bodyCm}cm`,
  '--resume-indent-list': `${INDENT.listCm}cm`,
  '--resume-indent-list-hanging': `${INDENT.listHangingCm}cm`,
  '--resume-color-body-text': COLOR.bodyText,
  '--resume-color-section-title-text': COLOR.sectionTitleText,
  '--resume-color-section-title-bg': COLOR.sectionTitleBackground,
  '--resume-color-section-title-border': COLOR.sectionTitleBorder,
  '--resume-color-time-text': COLOR.timeText,
  '--resume-header-column-gap': `${HEADER.columnGapCm}cm`,
  '--resume-photo-width': `${PHOTO.displayWidthCm}cm`,
  '--resume-photo-height': `${PHOTO.displayHeightCm}cm`,
} as const
