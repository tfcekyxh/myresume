import { E2E_MAIL_BASE } from './env'

/**
 * 从假邮件服务读回已收到的邮件（见 e2e/fake-mail-server.ts）。
 *
 * 用 Node 内置的 fetch——测试进程是 Node，且这个进程与假服务是两个进程，
 * 只能通过 HTTP 取回收件记录。
 */
export type ReceivedMail = {
  from: string
  to: string[]
  subject: string
  text: string
  attachments: { filename: string; content: string }[]
}

export async function getMails(): Promise<ReceivedMail[]> {
  const res = await fetch(`${E2E_MAIL_BASE}/mails`)
  if (!res.ok) throw new Error(`读取假邮件服务失败：${res.status}`)
  return (await res.json()) as ReceivedMail[]
}

/** 清空收件箱，避免上一个用例或备份定时器留下的邮件干扰断言。 */
export async function clearMails(): Promise<void> {
  const res = await fetch(`${E2E_MAIL_BASE}/mails`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`清空假邮件服务失败：${res.status}`)
}
