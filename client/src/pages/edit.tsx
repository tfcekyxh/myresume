import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ResumeForm } from '@/components/resume-form'
import { useResume } from '@/components/resume-gate'
import { useCurrentUser, useLogout } from '@/lib/auth'
import { rememberLastResume } from '@/lib/last-resume'

export function EditPage() {
  const { resumeId, title } = useResume()
  const { data: user } = useCurrentUser()
  const logout = useLogout()

  // 记录最近编辑的简历，登录默认跳回这里
  useEffect(() => {
    if (user) rememberLastResume(user.username, resumeId)
  }, [user, resumeId])

  async function handleLogout() {
    await logout.mutateAsync()
    // 整页跳转而不是 navigate：登出会把 user 置空，当前受保护路由随即重新渲染，
    // RequireAuth 会抢先把 from 写进 /login 的历史条目，下次登录就被它带偏。
    // 整页跳转同时清掉上一个用户残留的查询缓存。
    window.location.assign('/login')
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <header className="flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{title}</h1>
          <Link
            to="/resumes"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            我的简历
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm text-muted-foreground">{user?.username}</span>
          <Button variant="outline" onClick={handleLogout} disabled={logout.isPending}>
            登出
          </Button>
        </div>
      </header>

      <nav className="mt-4 flex gap-3">
        <Link
          to={`/resumes/${resumeId}/versions`}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          版本记录
        </Link>
        <Link
          to={`/resumes/${resumeId}/preview`}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          打印预览
        </Link>
      </nav>

      <section className="mt-8">
        <ResumeForm />
      </section>
    </div>
  )
}
