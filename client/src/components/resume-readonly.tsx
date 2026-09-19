import type { ReactNode } from 'react'
import {
  COLOR,
  FONT,
  FONT_SIZE_PT,
  INDENT,
  ITEM_TITLE,
  LINE_SPACING,
  PHOTO,
  SECTION_TITLE,
  type ExperienceItem,
  type ProjectItem,
  type ResumeData,
} from '@mymenu/shared'

/**
 * 简历只读渲染。
 *
 * 版本查看用它展示历史快照；打印预览页（Step 14）会复用同一套结构与样式常量。
 * 排版数值全部取自 shared 的常量，不在组件里写死。
 */

const hasText = (value: string | null | undefined): value is string =>
  (value ?? '').trim().length > 0

const rootStyle = {
  fontFamily: FONT.webFamily,
  fontSize: `${FONT_SIZE_PT.body}pt`,
  lineHeight: LINE_SPACING,
  color: COLOR.bodyText,
}

/**
 * 章节标题：白字黑底 + 灰色下划线。
 *
 * 黑底挂在内联 span 上，只盖住标题文字；下划线留在 h2 上，铺满整行。
 */
function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        fontSize: `${SECTION_TITLE.fontSizePt}pt`,
        borderBottom: `${SECTION_TITLE.borderSizePt}pt solid ${SECTION_TITLE.borderColor}`,
        paddingBottom: '0.15em',
      }}
    >
      <span
        className="font-bold"
        style={{
          color: SECTION_TITLE.textColor,
          backgroundColor: SECTION_TITLE.backgroundColor,
        }}
      >
        {children}
      </span>
    </h2>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    // break-inside-avoid：打印分页时尽量不把一段经历从中间切断
    <section className="space-y-1 break-inside-avoid">
      <SectionTitle>{title}</SectionTitle>
      <div style={{ paddingLeft: `${INDENT.bodyCm}cm`, paddingRight: `${INDENT.bodyCm}cm` }}>
        {children}
      </div>
    </section>
  )
}

function Time({ children }: { children: ReactNode }) {
  return <span style={{ color: COLOR.timeText }}>{children}</span>
}

/**
 * 条目头一行：首栏粗体，其余栏按常量表给的起始位置排开，时间靠右。
 *
 * 用 grid 复刻 docx 的制表位：第 2、3 栏的列宽由相邻起点相减得到。
 */
function ItemHeader({ columns, period }: { columns: (string | undefined)[]; period?: string }) {
  const parts = columns.filter(hasText)
  const starts = ITEM_TITLE.columnStartsCm
  const columnWidths = starts
    .slice(0, parts.length - 1)
    .map((cm, i) => `${cm - (starts[i - 1] ?? 0)}cm`)

  const template = [...columnWidths, '1fr', ...(hasText(period) ? ['auto'] : [])].join(' ')

  return (
    <div className="grid items-baseline" style={{ gridTemplateColumns: template }}>
      {parts.map((part, i) => (
        <span
          key={i}
          className={i === 0 ? 'font-bold' : undefined}
          style={i === 0 ? { fontSize: `${ITEM_TITLE.fontSizePt}pt` } : undefined}
        >
          {part}
        </span>
      ))}
      {hasText(period) && <Time>{period}</Time>}
    </div>
  )
}

/** 十进制编号的要点列表。 */
function Points({ points }: { points: string[] }) {
  const items = points.filter(hasText)
  if (items.length === 0) return null

  return (
    <ol
      className="list-decimal space-y-0.5"
      style={{
        // 与 docx 一致：编号顶格，列表正文缩进 listCm
        paddingLeft: `${INDENT.listCm}cm`,
      }}
    >
      {items.map((point, index) => (
        <li key={index}>{point}</li>
      ))}
    </ol>
  )
}

function Experience({ item }: { item: ExperienceItem }) {
  return (
    <div className="space-y-0.5">
      <ItemHeader columns={[item.company, item.role]} period={item.period} />
      {hasText(item.summary) && <p>{item.summary}</p>}
      <Points points={item.points} />
    </div>
  )
}

function Project({ item }: { item: ProjectItem }) {
  return (
    <div className="space-y-0.5">
      <ItemHeader columns={[item.name, item.type]} period={item.period} />
      {hasText(item.description) && <p>{item.description}</p>}
      {hasText(item.techStack) && (
        <p>
          <span className="font-bold">技术栈：</span>
          {item.techStack}
        </p>
      )}
      <Points points={item.points} />
    </div>
  )
}

export function ResumeReadonly({ data, photoBase64 }: { data: ResumeData; photoBase64?: string | null }) {
  const { basic } = data
  const contactLine = [basic.gender, basic.age, basic.phone, basic.email].filter(hasText)

  return (
    <div style={rootStyle} className="space-y-3">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h1 className="text-[1.6em] font-bold">{basic.name}</h1>
          {hasText(basic.intention) && <p>{basic.intention}</p>}
          {contactLine.length > 0 && <p>{contactLine.join(' · ')}</p>}
        </div>

        {photoBase64 && (
          <img
            src={`data:image/jpeg;base64,${photoBase64}`}
            alt="证件照"
            className="shrink-0 object-cover"
            style={{
              width: `${PHOTO.displayWidthCm}cm`,
              height: `${PHOTO.displayHeightCm}cm`,
            }}
          />
        )}
      </header>

      {data.education.length > 0 && (
        <Section title="教育经历">
          <div className="space-y-1">
            {data.education.map((item, index) => (
              <ItemHeader
                key={index}
                columns={[item.school, item.degree, item.major]}
                period={item.period}
              />
            ))}
          </div>
        </Section>
      )}

      {data.skills.some((skill) => hasText(skill.text)) && (
        <Section title="专业技能">
          <Points points={data.skills.map((skill) => skill.text)} />
        </Section>
      )}

      {data.work.length > 0 && (
        <Section title="工作经历">
          <div className="space-y-2">
            {data.work.map((item, index) => (
              <Experience key={index} item={item} />
            ))}
          </div>
        </Section>
      )}

      {data.internship.length > 0 && (
        <Section title="实习经历">
          <div className="space-y-2">
            {data.internship.map((item, index) => (
              <Experience key={index} item={item} />
            ))}
          </div>
        </Section>
      )}

      {data.projects.length > 0 && (
        <Section title="项目经历">
          <div className="space-y-2">
            {data.projects.map((item, index) => (
              <Project key={index} item={item} />
            ))}
          </div>
        </Section>
      )}

      {hasText(data.footer) && (
        <footer style={{ fontSize: `${FONT_SIZE_PT.footer}pt` }}>{data.footer}</footer>
      )}
    </div>
  )
}
