import { createContext, useContext, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import type { ResumeData } from '@mymenu/shared'
import { useCurrentResume } from '@/lib/resume'

type ResumeContextValue = {
  resumeId: string
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
 * 取到简历后再渲染子路由。
 *
 * 所有带 resume id 的接口都依赖这里拿到 id；编辑页也依赖 initialData 初始化表单。
 */
export function ResumeGate({ children }: { children?: ReactNode }) {
  const { data, isPending, error } = useCurrentResume()

  if (isPending) {
    return <div className="p-8 text-sm text-muted-foreground">加载中…</div>
  }

  if (error || !data) {
    return <div className="p-8 text-sm text-destructive">简历加载失败，请刷新页面重试</div>
  }

  const value: ResumeContextValue = {
    resumeId: data.id,
    initialData: data.data,
    photoId: data.photoId,
  }

  return (
    <ResumeContext.Provider value={value}>{children ?? <Outlet />}</ResumeContext.Provider>
  )
}
