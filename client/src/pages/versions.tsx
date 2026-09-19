import { Link } from 'react-router-dom'

export function VersionsPage() {
  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-xl font-semibold">版本记录</h1>
      <p className="mt-4 text-sm text-muted-foreground">待实现（Step 13）。</p>
      <Link
        to="/edit"
        className="mt-6 inline-block text-sm text-primary underline-offset-4 hover:underline"
      >
        返回编辑
      </Link>
    </div>
  )
}
