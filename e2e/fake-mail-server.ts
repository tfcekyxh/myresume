/**
 * e2e 专用的极简假邮件服务。
 *
 * 为什么需要它：被测服务只有配了 MAIL_API_KEY 才会真的走发信逻辑，否则
 * 「发送到邮箱」直接返回 503，测不出真实链路。又绝不能打真实邮件 API，
 * 所以 webServer 把 MAIL_API_URL 指到这里，服务端的 POST 全部落到本进程。
 *
 * 与 Playwright 的 worker 是两个进程（webServer 由 Playwright 单独拉起），
 * 因此收件记录放在进程内存里，用例通过 GET /mails 取回。
 *
 * 注意：一旦被测服务配了 MAIL_API_KEY，「每月备份邮件」定时器也会跟着启用，
 * 启动约 30 秒后会往同一个地址 POST 一封整库备份（subject 以「简历应用数据备份」开头）。
 * 本服务原样收下即可，用例断言时按 subject 过滤，绝不能用「收到几封」这种总数断言。
 */
import { E2E_MAIL_PORT } from './env'

export type ReceivedMail = {
  from: string
  to: string[]
  subject: string
  text: string
  attachments: { filename: string; content: string }[]
}

const mails: ReceivedMail[] = []

Bun.serve({
  port: E2E_MAIL_PORT,
  hostname: '127.0.0.1',
  async fetch(req) {
    const url = new URL(req.url)

    // 服务端发信走的就是这里（请求体按 Resend 约定组织，见 server/src/mail.ts）
    if (req.method === 'POST' && url.pathname === '/emails') {
      const body = (await req.json()) as Partial<ReceivedMail>
      mails.push({
        from: body.from ?? '',
        to: body.to ?? [],
        subject: body.subject ?? '',
        text: body.text ?? '',
        attachments: body.attachments ?? [],
      })
      // 与 Resend 一致：返回一个 id，状态码 2xx 即被 server 视为发送成功
      return Response.json({ id: `fake-${mails.length}` })
    }

    // 用例读取已收到的邮件
    if (req.method === 'GET' && url.pathname === '/mails') {
      return Response.json(mails)
    }

    // 用例清空收件箱，保证每个用例只看自己那一封
    if (req.method === 'DELETE' && url.pathname === '/mails') {
      mails.length = 0
      return Response.json({ ok: true })
    }

    // 就绪探测：Playwright 用 GET / 判断服务是否已起来
    if (req.method === 'GET' && url.pathname === '/') {
      return new Response('e2e fake mail server')
    }

    return new Response('not found', { status: 404 })
  },
})

console.log(`[fake-mail] listening on http://127.0.0.1:${E2E_MAIL_PORT}`)
