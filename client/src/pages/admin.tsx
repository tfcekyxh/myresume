import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, DatabaseBackup, Download, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { downloadBackup, importBackup, validateBackup, type SnapshotSummary } from '@/lib/backup'

/**
 * 数据备份页：整库导出与导入。只有管理员进得来（路由上挂了 RequireAdmin，
 * 接口上还有 requireAdmin 兜底）。
 *
 * 整库就是一个 .sqlite 文件，所以导出即把当前库的一致快照下载走，
 * 导入即用上传的文件整体覆盖当前库 —— 这是不可撤销的操作，所以中间夹一次确认。
 */
export function AdminPage() {
  const [exporting, setExporting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 校验通过、等待用户确认导入的那份文件 */
  const [pending, setPending] = useState<{ file: File; summary: SnapshotSummary } | null>(null)

  async function handleExport() {
    setExporting(true)
    setError(null)
    try {
      await downloadBackup()
      toast.success('已开始下载备份文件')
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败，请重试')
    } finally {
      setExporting(false)
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // 允许重复选择同一个文件
    event.target.value = ''
    if (!file) return

    setChecking(true)
    setError(null)
    try {
      const summary = await validateBackup(file)
      setPending({ file, summary })
    } catch (err) {
      setError(err instanceof Error ? err.message : '文件校验失败')
    } finally {
      setChecking(false)
    }
  }

  async function handleImport() {
    if (!pending) return
    setImporting(true)
    setError(null)
    try {
      await importBackup(pending.file)
      setPending(null)
      toast.success('已导入备份，请重新登录')
      // 会话随库一起被还原，当前登录态可能已经失效，直接回登录页最省事
      window.location.assign('/login')
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败，请重试')
      setPending(null)
    } finally {
      setImporting(false)
    }
  }

  const busy = exporting || checking || importing

  return (
    <div className="mx-auto max-w-3xl p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">数据备份</h1>
        <Link to="/resumes" className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ArrowLeft className="size-4" /> 返回简历列表
        </Link>
      </header>

      <p className="mt-3 text-sm text-muted-foreground">
        整个应用的数据就是一个 SQLite 文件。导出得到的就是它的快照，导入则是用它整体覆盖当前库。
      </p>

      <section className="mt-6 rounded-lg border p-4">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <DatabaseBackup className="size-4" /> 导出整库
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          下载包含全部账号、简历、版本与证件照的 .sqlite 文件，可用于备份或换机迁移。
        </p>
        <Button
          className="mt-3"
          variant="outline"
          onClick={() => void handleExport()}
          disabled={busy}
          data-testid="backup-export-button"
        >
          {exporting ? <Loader2 className="animate-spin" /> : <Download />}
          {exporting ? '导出中…' : '导出备份'}
        </Button>
      </section>

      <section className="mt-4 rounded-lg border p-4">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Upload className="size-4" /> 导入整库
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          选择之前导出的 .sqlite 文件，校验通过后会先展示内容摘要，确认后才真正覆盖。
          当前库会在覆盖前自动另存一份，文件名形如 app.sqlite.bak-时间戳。
        </p>

        <div className="mt-3 space-y-1.5">
          <Label htmlFor="backup-file">备份文件</Label>
          <input
            id="backup-file"
            aria-label="选择备份文件"
            data-testid="backup-file-input"
            type="file"
            accept=".sqlite,.db"
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm hover:file:bg-accent"
            onChange={(e) => void handleFileChange(e)}
            disabled={busy}
          />
          {checking && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> 正在校验文件…
            </p>
          )}
        </div>
      </section>

      {error && (
        <p className="mt-4 rounded-md bg-destructive/5 p-2 text-sm text-destructive">{error}</p>
      )}

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认导入这份备份？</DialogTitle>
            <DialogDescription>
              导入会用文件里的内容整体覆盖当前库，当前的全部账号、简历、版本与证件照都会被替换，
              <strong>此操作不可撤销</strong>。确认前请先确保已经导出过当前数据。
            </DialogDescription>
          </DialogHeader>

          {pending && (
            <>
              <dl className="space-y-1.5 rounded-lg border p-3 text-sm">
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-muted-foreground">文件</dt>
                  <dd className="min-w-0 break-all">{pending.file.name}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-muted-foreground">账号</dt>
                  <dd>{pending.summary.users} 个</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-muted-foreground">简历</dt>
                  <dd>{pending.summary.resumes} 份</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-muted-foreground">版本记录</dt>
                  <dd>{pending.summary.versions} 条</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-muted-foreground">证件照</dt>
                  <dd>{pending.summary.photos} 张</dd>
                </div>
              </dl>

              <p className="text-sm text-muted-foreground">导入完成后需要重新登录。</p>

              <DialogFooter>
                <Button variant="outline" onClick={() => setPending(null)} disabled={importing}>
                  取消
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void handleImport()}
                  disabled={importing}
                  data-testid="backup-import-confirm"
                >
                  {importing ? <Loader2 className="animate-spin" /> : null}
                  {importing ? '导入中…' : '确认覆盖'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
