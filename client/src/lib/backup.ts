import { ApiError } from './api'

/** 备份文件里导出的内容摘要，供导入前二次确认展示。 */
export type SnapshotSummary = {
  users: number
  resumes: number
  photos: number
  versions: number
}

/** 备份接口都用二进制体提交，服务端对应挂的是 express.raw。 */
async function postBackupFile<T>(path: string, file: File): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: await file.arrayBuffer(),
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(res.status, body?.error ?? `请求失败（${res.status}）`)
  }

  return (await res.json()) as T
}

/**
 * 导出整库并触发浏览器下载。
 *
 * 走 fetch 而不是直接跳转到接口地址：失败时（比如没有管理员权限）能拿到
 * `{ error }` 展示出来，而不是把用户丢到一个只显示报错 JSON 的页面上。
 */
export async function downloadBackup(): Promise<void> {
  const res = await fetch('/api/admin/backup')

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(res.status, body?.error ?? '导出失败')
  }

  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const filename = decodeURIComponent(
    disposition.split("filename*=UTF-8''")[1]?.split(';')[0] ?? 'mymenu-backup.sqlite',
  )

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** 先校验上传的文件能不能用，返回摘要。此步不会改动任何数据。 */
export function validateBackup(file: File): Promise<SnapshotSummary> {
  return postBackupFile<SnapshotSummary>('/admin/backup/validate', file)
}

/** 用上传的文件整体覆盖当前库。不可撤销，服务端会先自动留一份当前库的快照。 */
export function importBackup(file: File): Promise<SnapshotSummary & { backupFile: string }> {
  return postBackupFile<SnapshotSummary & { backupFile: string }>('/admin/backup/import', file)
}
