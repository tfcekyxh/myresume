import { createContext, useContext, type ReactNode } from 'react'
import { Link, Outlet, useParams } from 'react-router-dom'
import type { ResumeData } from '@mymenu/shared'
import { useResumeDetail } from '@/lib/resume'

type ResumeContextValue = {
  resumeId: string
  /** 简历名称，供页面标题使用 */
  title: string
  /** 进入编辑页时的草稿内容。useForm 的 defaultValues 只在首次渲染生效，所以必须等它就绪再渲染表单。 */
  initialData: ResumeData
  photoId: string | null
}

const ResumeContext = createContext<ResumeContextValue | null>(null)

export function useResume() {
  const value = useContext(ResumeContext)
  if (!value) throw new Error('useResume 只能在 ResumeGate 内使用')
  return value
}

/**
 * 取到指定简历后再渲染子路由。
 *
 * resume id 来自 URL（`/resumes/:resumeId/...`），所以刷新与直接分享链接都能落到同一份简历。
 */
export function ResumeGate({ children }: { children?: ReactNode }) {
  const { resumeId = '' } = useParams<{ resumeId: string }>()
  const { data, isPending, error } = useResumeDetail(resumeId)

  if (isPending) {
    return <div className="p-8 text-sm text-muted-foreground">加载中…</div>
  }

  if (error || !data) {
    return (
      <div className="space-y-3 p-8">
        <p className="text-sm text-destructive">简历加载失败，可能已被删除。</p>
        <Link to="/resumes" className="text-sm text-primary underline-offset-4 hover:underline">
          返回简历列表
        </Link>
      </div>
    )
  }

  const value: ResumeContextValue = {
    resumeId: data.id,
    title: data.title,
    initialData: data.data,
    photoId: data.photoId,
  }

  return (
    <ResumeContext.Provider value={value}>{children ?? <Outlet />}</ResumeContext.Provider>
  )
}
