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
    <div className="mx-auto max-w-3xl px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-8">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="w-full min-w-0 truncate text-lg font-semibold sm:w-auto sm:text-xl">{title}</h1>
        {/* 用按钮样式而不是纯文字链接，一眼能看出可点 */}
        <Link
          to="/resumes"
          className={buttonVariants({
            variant: 'outline',
            size: 'sm',
            className: 'h-10 shrink-0 sm:h-8',
          })}
        >
          <ArrowLeft /> 我的简历
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{user?.username}</span>
          <Button
            variant="outline"
            className="h-10 shrink-0 sm:h-8"
            onClick={handleLogout}
            disabled={logout.isPending}
          >
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
