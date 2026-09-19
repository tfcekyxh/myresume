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

const resumeKey = ['resume', 'current'] as const

/**
 * 当前用户的简历（含草稿内容）。不存在时后端会自动建一份。
 *
 * staleTime 设为 Infinity：草稿以编辑页的表单为准，
 * 不能让窗口重新聚焦时的自动刷新把用户正在改的内容覆盖掉。
 */
export function useCurrentResume() {
  return useQuery({
    queryKey: resumeKey,
    queryFn: () => api<ResumeRecord>('/resumes/current'),
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
    onSuccess: (result) => {
      queryClient.setQueryData<ResumeRecord>(resumeKey, (prev) =>
        prev ? { ...prev, updatedAt: result.updatedAt } : prev
      )
    },
  })
}
