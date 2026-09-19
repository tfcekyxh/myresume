import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { PAGE } from '@mymenu/shared'
import { ResumeReadonly } from '@/components/resume-readonly'
import { useResume } from '@/components/resume-gate'
import { usePhoto } from '@/lib/photo'
import { useResumeDetail } from '@/lib/resume'

/**
 * 打印预览。
 *
 * 内容区是纯 HTML + Tailwind（不用 shadcn 组件），样式值取自 shared 的常量表。
 * 尺寸通过 CSS 变量下发、由 class 引用，这样打印态才能用 `print:` 覆盖掉它们
 * ——直接写 inline style 的话优先级高于 class，覆盖不掉。
 *
 * 页边距的两种来源：屏幕上靠容器 padding 模拟，打印时由 `@page` 的 margin 提供，
 * 所以打印态要把 padding 归零，否则边距会叠成两倍。
 */
export function PreviewPage() {
  const { resumeId } = useResume()
  const { data: resume } = useResumeDetail(resumeId)
  const { data: photo } = usePhoto(resumeId, resume?.photoId ?? null)

  if (!resume) return null

  const pageVars = {
    '--page-width': `${PAGE.widthCm}cm`,
    '--page-height': `${PAGE.heightCm}cm`,
    '--page-margin-y': `${PAGE.marginTopCm}cm`,
    '--page-margin-x': `${PAGE.marginLeftCm}cm`,
  } as CSSProperties

  return (
    <>
      {/* @page 的数值没法从 CSS 变量取，运行时按常量注入 */}
      <style>{`@page {
        size: A4;
        margin: ${PAGE.marginTopCm}cm ${PAGE.marginRightCm}cm ${PAGE.marginBottomCm}cm ${PAGE.marginLeftCm}cm;
      }`}</style>

      <div className="flex items-center justify-between gap-3 border-b bg-background px-6 py-3 print:hidden">
        <Link
          to={`/resumes/${resumeId}/edit`}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          返回编辑
        </Link>
        <p className="text-xs text-muted-foreground">
          A4 · 页边距 {PAGE.marginLeftCm}cm · 在打印对话框里选「另存为 PDF」
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground"
        >
          打印 / 导出 PDF
        </button>
      </div>

      <div className="overflow-x-auto bg-muted/40 py-6 print:overflow-visible print:bg-white print:py-0">
        <div
          style={pageVars}
          className="mx-auto w-(--page-width) min-h-(--page-height) bg-white shadow-sm print:w-auto print:min-h-0 print:shadow-none"
        >
          <div className="p-(--page-margin-y) px-(--page-margin-x) print:p-0">
            <ResumeReadonly data={resume.data} photoBase64={photo?.data ?? null} />
          </div>
        </div>
      </div>
    </>
  )
}
