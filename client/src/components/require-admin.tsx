import { Navigate, Outlet } from 'react-router-dom'
import { useCurrentUser } from '@/lib/auth'

/** 路由守卫：非管理员直接回到简历列表，连页面都不给进。 */
export function RequireAdmin() {
  const { data: user, isPending } = useCurrentUser()

  if (isPending) {
    return <div className="p-8 text-sm text-muted-foreground">加载中…</div>
  }

  if (!user?.isAdmin) {
    return <Navigate to="/resumes" replace />
  }

  return <Outlet />
}
