import { useCallback, useEffect, useRef, useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import type { ResumeData } from '@mymenu/shared'
import { useSaveDraft } from '@/lib/resume'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/** 停止输入多久后落库。 */
const DEBOUNCE_MS = 1000

/**
 * 草稿自动保存。
 *
 * 表单变化后 debounce 1s 整体 PATCH；页面隐藏或卸载时立刻补发一次，
 * 避免丢掉最后一秒的输入。
 *
 * 返回的 `flush` 用于「存档」这类需要确保改动已落库的操作。
 */
export function useDraftAutosave(resumeId: string, form: UseFormReturn<ResumeData>) {
  const saveDraft = useSaveDraft()
  // useMutation 每次渲染都返回新的结果对象，直接作为依赖会让 flush 跟着重建，
  // watch effect 随之反复退订 / 重订，cleanup 里的 clearTimeout 会误杀防抖定时器
  // （form.reset 触发的重渲染与定时器安排在同一轮提交里，导入简历确认后草稿会因此不落库）。
  // 用 ref 持有 mutation，保证 flush 身份在 resumeId 不变期间稳定。
  const saveDraftRef = useRef(saveDraft)
  saveDraftRef.current = saveDraft

  const [status, setStatus] = useState<SaveStatus>('idle')

  const timer = useRef<number | undefined>(undefined)
  /** 待保存的内容，null 表示没有未落库的改动。 */
  const pending = useRef<ResumeData | null>(null)

  const flush = useCallback(async () => {
    const data = pending.current
    if (!data) return
    pending.current = null
    setStatus('saving')

    try {
      await saveDraftRef.current.mutateAsync({ id: resumeId, data })
      setStatus('saved')
    } catch {
      setStatus('error')
      // 保存期间若又有新改动，以新内容为准，别用旧的覆盖回去
      if (!pending.current) pending.current = data
    }
  }, [resumeId])

  // 表单变化 → debounce 保存
  useEffect(() => {
    const subscription = form.watch((values) => {
      pending.current = values as ResumeData
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void flush(), DEBOUNCE_MS)
    })

    return () => {
      subscription.unsubscribe()
      window.clearTimeout(timer.current)
    }
  }, [form, flush])

  // 页面隐藏 / 卸载时立即补发
  useEffect(() => {
    function flushOnHide() {
      window.clearTimeout(timer.current)
      const data = pending.current
      if (!data) return
      pending.current = null

      // sendBeacon 只能发 POST，而这里是 PATCH；
      // 用 fetch 的 keepalive 让请求在页面卸载后继续发完。
      void fetch(`/api/resumes/${resumeId}/draft`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
        keepalive: true,
      }).catch(() => {
        // 页面已在卸载，失败也无法提示，下次进入时以库中内容为准
      })
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') flushOnHide()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', flushOnHide)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', flushOnHide)
    }
  }, [resumeId])

  return { status, flush }
}
