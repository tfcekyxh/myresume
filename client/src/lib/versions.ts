import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ResumeData } from '@mymenu/shared'
import { api } from './api'
import { detectDocxFont } from './fonts'
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

export function useDeleteVersion(resumeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (versionId: string) =>
      api<{ ok: true }>(`/resumes/${resumeId}/versions/${versionId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: versionsKey(resumeId) })
      // 删掉最后一份版本会清空草稿的「已存档」基准，标签依赖它
      void queryClient.invalidateQueries({ queryKey: resumeKey(resumeId) })
    },
  })
}

/**
 * 把某个存档版本导出成 Word + PDF 发到配置的邮箱。
 *
 * 接口挂在 /api/admin 下：这是管理员能力，服务端会按 ADMIN_USERNAME 拦掉普通账号。
 * docx 用什么字体由打开方本机决定，所以和下载导出一样先在本机探测再带过去。
 */
export function useEmailVersion(resumeId: string) {
  return useMutation({
    mutationFn: (versionId: string) =>
      api<{ ok: true; to: string[] }>(`/admin/resumes/${resumeId}/versions/${versionId}/email`, {
        method: 'POST',
        body: JSON.stringify({ fontFamily: detectDocxFont() }),
      }),
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
