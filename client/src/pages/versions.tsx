import { useState } from 'react'
import { Link } from 'react-router-dom'
import { RotateCcw, Eye } from 'lucide-react'
import { ResumeReadonly } from '@/components/resume-readonly'
import { useResume } from '@/components/resume-gate'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useRestoreVersion, useVersion, useVersions } from '@/lib/versions'

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 查看某个版本的只读内容，含当时的照片。 */
function VersionDialog({
  resumeId,
  versionId,
  onClose,
}: {
  resumeId: string
  versionId: string | null
  onClose: () => void
}) {
  const { data: version, isPending } = useVersion(resumeId, versionId)

  return (
    <Dialog open={versionId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {version ? `版本快照 · ${formatTime(version.createdAt)}` : '版本快照'}
          </DialogTitle>
        </DialogHeader>

        {isPending && <p className="text-sm text-muted-foreground">加载中…</p>}

        {version && (
          <div className="rounded-lg border bg-white p-4">
            <ResumeReadonly
              data={version.snapshot}
              photoBase64={version.photo?.data ?? null}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function VersionsPage() {
  const { resumeId } = useResume()
  const { data: versions, isPending } = useVersions(resumeId)
  const restore = useRestoreVersion(resumeId)

  const [viewingId, setViewingId] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  async function handleRestore() {
    if (!restoringId) return
    await restore.mutateAsync(restoringId)
    // 恢复会覆盖草稿，而编辑页的表单只在挂载时用初始数据渲染，
    // 所以整页跳回编辑页重新取数据，而不是走前端路由。
    window.location.assign('/edit')
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">版本记录</h1>
        <Link
          to="/edit"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          返回编辑
        </Link>
      </header>

      {isPending && <p className="mt-6 text-sm text-muted-foreground">加载中…</p>}

      {versions && versions.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          还没有版本记录。在编辑页点「存档」可以把当前内容存成一个版本。
        </p>
      )}

      {versions && versions.length > 0 && (
        <ul className="mt-6 space-y-2">
          {versions.map((version) => (
            <li
              key={version.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm">{formatTime(version.createdAt)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {version.note || '（无备注）'}
                </p>
              </div>

              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => setViewingId(version.id)}>
                  <Eye /> 查看
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRestoringId(version.id)}
                >
                  <RotateCcw /> 恢复
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <VersionDialog
        resumeId={resumeId}
        versionId={viewingId}
        onClose={() => setViewingId(null)}
      />

      <AlertDialog
        open={restoringId !== null}
        onOpenChange={(open) => !open && setRestoringId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>恢复到这个版本？</AlertDialogTitle>
            <AlertDialogDescription>
              当前草稿的内容与照片会被这个版本覆盖，且不会自动保存成新版本。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restore.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRestore()} disabled={restore.isPending}>
              {restore.isPending ? '恢复中…' : '确认恢复'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
