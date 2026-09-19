export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** 统一的接口调用封装：自动带 cookie，非 2xx 抛 ApiError。 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(res.status, body?.error ?? `请求失败（${res.status}）`)
  }

  return (await res.json()) as T
}
