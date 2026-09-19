import { Link, useNavigate } from 'react-router-dom'
import { RESUME_MODULES } from '@mymenu/shared'
import { Button } from '@/components/ui/button'
import { useCurrentUser, useLogout } from '@/lib/auth'

export function EditPage() {
  const { data: user } = useCurrentUser()
  const logout = useLogout()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout.mutateAsync()
    navigate('/login', { replace: true })
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">编辑简历</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user?.username}</span>
          <Button variant="outline" onClick={handleLogout} disabled={logout.isPending}>
            登出
          </Button>
        </div>
      </header>

      <nav className="mt-4 flex gap-3">
        <Link to="/versions" className="text-sm text-primary underline-offset-4 hover:underline">
          版本记录
        </Link>
        <Link to="/preview" className="text-sm text-primary underline-offset-4 hover:underline">
          打印预览
        </Link>
      </nav>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-muted-foreground">简历模块</h2>
        <ul className="mt-3 space-y-1">
          {RESUME_MODULES.map((m) => (
            <li key={m.key} className="text-sm">
              {m.title}
              {m.multiple && <span className="ml-2 text-muted-foreground">可多条</span>}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-8 text-sm text-muted-foreground">
        表单、自动保存与照片上传将在后续步骤实现。
      </p>
    </div>
  )
}
