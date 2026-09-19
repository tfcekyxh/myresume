import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ResumeData } from '@mymenu/shared'
import { api } from './api'

export type ResumeRecord = {
  id: string
  title: string
  data: ResumeData
  photoId: string | null
  updatedAt: string
}

export type ResumeListItem = {
  id: string
  title: string
  updatedAt: string
}

export const resumesKey = ['resumes'] as const
export const resumeKey = (resumeId: string) => ['resume', resumeId] as const

/** 当前用户的简历列表（前端 / 后端 / 全栈…）。 */
export function useResumes() {
  return useQuery({
    queryKey: resumesKey,
    queryFn: () => api<ResumeListItem[]>('/resumes'),
  })
}

/**
 * 单份简历（含草稿内容）。
 *
 * staleTime 设为 Infinity：草稿以编辑页的表单为准，
 * 不能让窗口重新聚焦时的自动刷新把用户正在改的内容覆盖掉。
 */
export function useResumeDetail(resumeId: string) {
  return useQuery({
    queryKey: resumeKey(resumeId),
    queryFn: () => api<ResumeRecord>(`/resumes/${resumeId}`),
    staleTime: Infinity,
  })
}

export function useSaveDraft() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ResumeData }) =>
      api<{ id: string; updatedAt: string }>(`/resumes/${id}/draft`, {
        method: 'PATCH',
        body: JSON.stringify({ data }),
      }),
    onSuccess: (result, { id, data }) => {
      // 同步更新缓存里的草稿内容，版本页的「当前草稿」条目靠它显示最新内容
      queryClient.setQueryData<ResumeRecord>(resumeKey(id), (prev) =>
        prev ? { ...prev, data, updatedAt: result.updatedAt } : prev
      )
    },
  })
}

export function useCreateResume() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (title: string) =>
      api<ResumeListItem>('/resumes', { method: 'POST', body: JSON.stringify({ title }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: resumesKey })
    },
  })
}

export function useRenameResume() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api<ResumeListItem>(`/resumes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<ResumeRecord>(resumeKey(updated.id), (prev) =>
        prev ? { ...prev, title: updated.title } : prev
      )
      void queryClient.invalidateQueries({ queryKey: resumesKey })
    },
  })
}

export function useDeleteResume() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/resumes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: resumesKey })
    },
  })
}
