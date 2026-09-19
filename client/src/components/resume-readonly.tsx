import type { ReactNode } from 'react'
import {
  COLOR,
  FONT,
  FONT_SIZE_PT,
  INDENT,
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

const hasText = (value: string | null | undefined) => (value ?? '').trim().length > 0

const rootStyle = {
  fontFamily: FONT.webFamily,
  fontSize: `${FONT_SIZE_PT.body}pt`,
  lineHeight: LINE_SPACING,
  color: COLOR.bodyText,
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      className="font-bold"
      style={{
        fontSize: `${SECTION_TITLE.fontSizePt}pt`,
        color: SECTION_TITLE.textColor,
        backgroundColor: SECTION_TITLE.backgroundColor,
        borderBottom: `${SECTION_TITLE.borderSizePt}pt solid ${SECTION_TITLE.borderColor}`,
        padding: '0.1em 0.35em',
      }}
    >
      {children}
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

/** 条目头一行：左侧粗体标题，右侧灰色时间。 */
function ItemHeader({ title, period }: { title: string; period?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-bold" style={{ fontSize: `${FONT_SIZE_PT.itemTitle}pt` }}>
        {title}
      </span>
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
  const heading = [item.role, item.company].filter(hasText).join(' · ')

  return (
    <div className="space-y-0.5">
      <ItemHeader title={heading} period={item.period} />
      {hasText(item.summary) && <p>{item.summary}</p>}
      <Points points={item.points} />
    </div>
  )
}

function Project({ item }: { item: ProjectItem }) {
  return (
    <div className="space-y-0.5">
      <ItemHeader title={item.name} period={item.period} />
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
              <div key={index} className="flex items-baseline justify-between gap-3">
                <span className="font-bold">{item.school}</span>
                <span>
                  {[item.degree, item.major].filter(hasText).join(' · ')}
                </span>
                <Time>{item.period}</Time>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.skills.some((skill) => hasText(skill.text)) && (
        <Section title="专业技能">
          <div className="space-y-0.5">
            {data.skills
              .filter((skill) => hasText(skill.text))
              .map((skill, index) => (
                <p key={index}>{skill.text}</p>
              ))}
          </div>
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
