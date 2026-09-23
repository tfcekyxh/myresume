import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, type Resolver } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { useCurrentUser, useLogin, useRegister } from '@/lib/auth'
import { lastResumeEditTarget } from '@/lib/last-resume'

type Mode = 'login' | 'register'

const loginSchema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
})

const registerSchema = z
  .object({
    username: z.string().min(3, '用户名至少 3 个字符').max(50, '用户名最多 50 个字符'),
    password: z.string().min(6, '密码至少 6 个字符').max(200, '密码最多 200 个字符'),
    confirmPassword: z.string().min(1, '请再次输入密码'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
  })

type AuthForm = z.infer<typeof registerSchema>

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const { data: user, isPending } = useCurrentUser()
  const location = useLocation()

  // 被拦下来的路径优先，否则回最近编辑的那份简历
  const from = (location.state as { from?: string } | null)?.from

  // 已登录直接放行，避免重复登录
  if (!isPending && user) {
    return <Navigate to={from ?? lastResumeEditTarget(user.username)} replace />
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === 'login' ? '登录' : '注册'}</CardTitle>
          <CardDescription>
            {mode === 'login' ? '登录后编辑简历' : '创建账号后开始编辑简历'}
          </CardDescription>
        </CardHeader>
        {/* key 随模式变化：切换登录/注册时整体重置表单与校验规则 */}
        <AuthFormCard key={mode} mode={mode} from={from} onSwitchMode={setMode} />
      </Card>
    </div>
  )
}

function AuthFormCard({
  mode,
  from,
  onSwitchMode,
}: {
  mode: Mode
  from?: string
  onSwitchMode: (mode: Mode) => void
}) {
  const login = useLogin()
  const register = useRegister()
  const navigate = useNavigate()
  const mutation = mode === 'login' ? login : register

  const form = useForm<AuthForm>({
    resolver: zodResolver(
      mode === 'login' ? loginSchema : registerSchema,
    ) as unknown as Resolver<AuthForm>,
    defaultValues: { username: '', password: '', confirmPassword: '' },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    const credentials = { username: values.username, password: values.password }
    try {
      const loggedIn =
        mode === 'login'
          ? await login.mutateAsync(credentials)
          : await register.mutateAsync(credentials)
      navigate(from ?? lastResumeEditTarget(loggedIn.username), { replace: true })
    } catch (err) {
      form.setError('root', {
        message: err instanceof ApiError ? err.message : '操作失败，请稍后重试',
      })
    }
  })

  const errors = form.formState.errors

  return (
    <CardContent>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="username">用户名</Label>
          <Input id="username" autoComplete="username" {...form.register('username')} />
          {errors.username && (
            <p className="text-sm text-destructive">{errors.username.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">密码</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            {...form.register('password')}
          />
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        {mode === 'register' && (
          <div className="space-y-2">
            <Label htmlFor="confirm-password">确认密码</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              {...form.register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>
        )}

        {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending
            ? mode === 'login'
              ? '登录中…'
              : '注册中…'
            : mode === 'login'
              ? '登录'
              : '注册'}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        {mode === 'login' ? (
          <>
            没有账号？
            <button
              type="button"
              className="ml-1 text-primary hover:underline"
              onClick={() => onSwitchMode('register')}
            >
              立即注册
            </button>
          </>
        ) : (
          <>
            已有账号？
            <button
              type="button"
              className="ml-1 text-primary hover:underline"
              onClick={() => onSwitchMode('login')}
            >
              去登录
            </button>
          </>
        )}
      </p>
    </CardContent>
  )
}
