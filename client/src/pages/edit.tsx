import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ResumeForm } from '@/components/resume-form'
import { useResume } from '@/components/resume-gate'
import { useCurrentUser, useLogout } from '@/lib/auth'

export function EditPage() {
  const { resumeId, title } = useResume()
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
