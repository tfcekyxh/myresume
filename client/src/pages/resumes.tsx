import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCurrentUser, useLogout } from '@/lib/auth'
import { forgetLastResume } from '@/lib/last-resume'
import {
  useCreateResume,
  useDeleteResume,
  useRenameResume,
  useResumes,
  type ResumeListItem,
} from '@/lib/resume'

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 新建 / 重命名共用的标题输入弹窗。 */
function TitleDialog({
  open,
  onOpenChange,
  title,
  description,
  initialValue,
  pending,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  initialValue: string
  pending: boolean
  onSubmit: (value: string) => Promise<void>
}) {
  const [value, setValue] = useState(initialValue)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setValue(initialValue)
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="resume-title">简历名称</Label>
          <Input
            id="resume-title"
            placeholder="如：前端工程师简历"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            取消
          </Button>
          <Button
            onClick={() => void onSubmit(value.trim())}
            disabled={pending || value.trim().length === 0}
          >
            {pending ? '保存中…' : '确定'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ResumeListPage() {
  const { data: user } = useCurrentUser()
  const logout = useLogout()
  const navigate = useNavigate()

  const { data: resumes, isPending } = useResumes()
  const create = useCreateResume()
  const rename = useRenameResume()
  const remove = useDeleteResume()

  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<ResumeListItem | null>(null)
  const [deleting, setDeleting] = useState<ResumeListItem | null>(null)

  async function handleLogout() {
    await logout.mutateAsync()
    // 同编辑页：整页跳转，避免 RequireAuth 把 from 带进登录页
    window.location.assign('/login')
  }

  async function handleCreate(title: string) {
    const created = await create.mutateAsync(title)
    setCreating(false)
    navigate(`/resumes/${created.id}/edit`)
  }

  async function handleRename(title: string) {
    if (!renaming) return
    await rename.mutateAsync({ id: renaming.id, title })
    setRenaming(null)
  }

  async function handleDelete() {
    if (!deleting) return
    await remove.mutateAsync(deleting.id)
    // 删掉的正好是登录默认要进的那份，就清掉记录，免得下次登录落到不存在的简历
    if (user) forgetLastResume(user.username, deleting.id)
    setDeleting(null)
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">我的简历</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user?.username}</span>
          <Button variant="outline" onClick={handleLogout} disabled={logout.isPending}>
            登出
          </Button>
        </div>
      </header>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          一个人可以有多份简历，比如前端、后端、全栈各一份。
        </p>
        <Button onClick={() => setCreating(true)}>
          <Plus /> 新建简历
        </Button>
      </div>

      {isPending && <p className="mt-6 text-sm text-muted-foreground">加载中…</p>}

      {resumes && resumes.length === 0 && (
        <div className="mt-6 rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">还没有简历，先建一份吧。</p>
          <Button className="mt-4" onClick={() => setCreating(true)}>
            <Plus /> 新建简历
          </Button>
        </div>
      )}

      {resumes && resumes.length > 0 && (
        <ul className="mt-6 space-y-2">
          {resumes.map((resume) => (
            <li
              key={resume.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <Link
                to={`/resumes/${resume.id}/edit`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{resume.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    最后修改于 {formatTime(resume.updatedAt)}
                  </span>
                </span>
              </Link>

              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => setRenaming(resume)}>
                  <Pencil /> 重命名
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDeleting(resume)}>
                  <Trash2 /> 删除
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <TitleDialog
        open={creating}
        onOpenChange={setCreating}
        title="新建简历"
        description="给它起个名字，比如「前端工程师简历」。之后可以随时重命名。"
        initialValue=""
        pending={create.isPending}
        onSubmit={handleCreate}
      />

      <TitleDialog
        open={renaming !== null}
        onOpenChange={(open) => !open && setRenaming(null)}
        title="重命名简历"
        description="只改名称，内容与版本记录不受影响。"
        initialValue={renaming?.title ?? ''}
        pending={rename.isPending}
        onSubmit={handleRename}
      />

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除「{deleting?.title}」？</DialogTitle>
            <DialogDescription>
              简历内容、证件照与全部版本记录都会被删除，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={remove.isPending}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={remove.isPending}
            >
              {remove.isPending ? '删除中…' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
