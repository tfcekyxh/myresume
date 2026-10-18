import { resolve } from 'node:path'

/**
 * e2e 的运行环境参数。
 *
 * 测试**必须**跑在自己的库与自己的端口上：
 * - 库文件独立（e2e/.db/e2e.sqlite），用例会清空测试账号的简历，绝不能落到你自己的库上；
 * - 端口独立，这样你可以同时开着 `bun run dev` 做别的事，互不打扰，
 *   也因此 `reuseExistingServer` 必须是 false——复用已在跑的 dev 就等于连回了主库。
 *
 * 这里用副作用把 SQLITE_PATH 钉死，是为了让 playwright.config 里的
 * webServer 子进程也继承到同一个路径（它比 globalSetup 更早启动）。
 */

export const E2E_DB_PATH = resolve(process.cwd(), 'e2e/.db/e2e.sqlite')

export const E2E_CLIENT_PORT = Number(process.env.E2E_CLIENT_PORT ?? 5200)
export const E2E_API_PORT = Number(process.env.E2E_API_PORT ?? 3100)

export const E2E_BASE_URL = `http://localhost:${E2E_CLIENT_PORT}`

// 覆盖而不是兜底：shell 里正好设过 SQLITE_PATH 也不能改变测试用独立库这件事
process.env.SQLITE_PATH = E2E_DB_PATH
