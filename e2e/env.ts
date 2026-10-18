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

/**
 * e2e 专用的假邮件服务（见 e2e/fake-mail-server.ts）。
 *
 * 被测服务必须配 MAIL_API_KEY 才会真的发信；不给的话「发送到邮箱」直接 503，
 * 测不出真实链路。所以这里把服务端要 POST 的 MAIL_API_URL 指到本地假服务上，
 * 让用例能收到并检查邮件内容，全程不碰真实邮件 API。
 *
 * 用 127.0.0.1 而不是 localhost：localhost 在 macOS 上可能先解析到 ::1，
 * 而假服务只监听 IPv4 时 Bun 的 fetch 会连不上。
 */
export const E2E_MAIL_PORT = Number(process.env.E2E_MAIL_PORT ?? 5400)
export const E2E_MAIL_BASE = `http://127.0.0.1:${E2E_MAIL_PORT}`
export const E2E_MAIL_API_URL = `${E2E_MAIL_BASE}/emails`

/**
 * 测试用的收件人。
 *
 * `MAIL_TO` 在生产上不给默认值（真实邮箱只留在 .env 与部署变量里，不进仓库），
 * 所以 webServer 必须显式注入一个。这里用 example.com 的假地址：邮件只会落到
 * 上面的假服务，收件人是什么不影响用例有效性。
 */
export const E2E_MAIL_TO = 'e2e-recipient@example.com'

// 覆盖而不是兜底：shell 里正好设过 SQLITE_PATH 也不能改变测试用独立库这件事
process.env.SQLITE_PATH = E2E_DB_PATH
