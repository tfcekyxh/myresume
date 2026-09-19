import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ResumeData } from '@mymenu/shared'
import { api } from './api'
import { resumeKey } from './resume'

export type VersionSummary = {
  id: string
  note: string | null
  createdAt: string
}

export type VersionDetail = VersionSummary & {
  snapshot: ResumeData
  photoId: string | null
  /** 该版本当时的照片内容，由后端一并返回，避免再多一次请求 */
  photo: { id: string; data: string } | null
}

const versionsKey = (resumeId: string) => ['resume', resumeId, 'versions'] as const

export function useVersions(resumeId: string) {
  return useQuery({
    queryKey: versionsKey(resumeId),
    queryFn: () => api<VersionSummary[]>(`/resumes/${resumeId}/versions`),
  })
}

export function useVersion(resumeId: string, versionId: string | null) {
  return useQuery({
    queryKey: [...versionsKey(resumeId), versionId],
    queryFn: () => api<VersionDetail>(`/resumes/${resumeId}/versions/${versionId}`),
    enabled: versionId !== null,
  })
}

export function useCreateVersion(resumeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (note: string) =>
      api<VersionSummary>(`/resumes/${resumeId}/versions`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: versionsKey(resumeId) })
      // 存档会刷新草稿的「已存档」基准，版本页的标签依赖它
      void queryClient.invalidateQueries({ queryKey: resumeKey(resumeId) })
    },
  })
}

export function useRestoreVersion(resumeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (versionId: string) =>
      api<{ id: string }>(`/resumes/${resumeId}/versions/${versionId}/restore`, {
        method: 'POST',
      }),
    onSuccess: () => {
      // 恢复会覆盖草稿，之后整页跳回编辑页重新取数据（见调用处），
      // 这里只需把缓存标脏，避免拿到旧的草稿内容
      void queryClient.invalidateQueries({ queryKey: resumeKey(resumeId) })
    },
  })
}
