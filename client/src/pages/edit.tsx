import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { ResumeForm } from '@/components/resume-form'
import { ResumeTabs } from '@/components/resume-tabs'
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
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-xl font-semibold">{title}</h1>
          {/* 用按钮样式而不是纯文字链接，一眼能看出可点 */}
          <Link
            to="/resumes"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <ArrowLeft /> 我的简历
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm text-muted-foreground">{user?.username}</span>
          <Button variant="outline" onClick={handleLogout} disabled={logout.isPending}>
            登出
          </Button>
        </div>
      </header>

      <ResumeTabs resumeId={resumeId} active="edit" />

      <section className="mt-8">
        <ResumeForm />
      </section>
    </div>
  )
}
