import { Link } from 'react-router-dom'
import { cn } from 'cn'

type TabKey = 'edit' | 'versions'

/** 同一份简历的两个视图。顺序沿用版本页的惯例：当前工作区在前，归档快照在后。 */
const TABS: { key: TabKey; label: string; path: (resumeId: string) => string }[] = [
  { key: 'edit', label: '正在编辑', path: (id) => `/resumes/${id}/edit` },
  { key: 'versions', label: '已归档的简历版本', path: (id) => `/resumes/${id}/versions` },
]

/**
 * 简历视图切换的标签栏。
 *
 * 编辑页与版本页共用，当前页那条渲染成不可点的 span 并高亮，
 * 让「我在哪一页、还能去哪」一眼可见。
 */
export function ResumeTabs({ resumeId, active }: { resumeId: string; active: TabKey }) {
  return (
    <nav aria-label="简历视图" className="mt-4 flex gap-1 border-b">
      {TABS.map((tab) => {
        const isActive = tab.key === active
        const className = cn(
          '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
          isActive
            ? 'border-primary font-medium text-foreground'
            : 'border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
        )

        return isActive ? (
          <span key={tab.key} aria-current="page" className={className}>
            {tab.label}
          </span>
        ) : (
          <Link key={tab.key} to={tab.path(resumeId)} className={className}>
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
