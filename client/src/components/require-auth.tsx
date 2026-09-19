import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useCurrentUser } from '@/lib/auth'

/** 路由守卫：未登录跳转到登录页，并记住来源路径。 */
export function RequireAuth() {
  const { data: user, isPending } = useCurrentUser()
  const location = useLocation()

  if (isPending) {
    return <div className="p-8 text-sm text-muted-foreground">加载中…</div>
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
