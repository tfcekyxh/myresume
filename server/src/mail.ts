import { BACKUP_EMAIL_TO, MAIL_API_KEY, MAIL_API_URL, MAIL_FROM } from './env'

/**
 * 发信走第三方邮件 API 的 HTTP 接口，不走 SMTP。
 *
 * 云端平台（Railway 这类）对出站 25/465 端口常有封锁，走 HTTPS 的接口最稳；
 * 代价是发件地址通常得是服务商认可的地址（Resend 未验证自有域名时只能是
 * onboarding@resend.dev，并且只能发给注册邮箱），这也是 MAIL_FROM 必须可配的原因。
 *
 * 请求体按 Resend 的约定组织（from / to / subject / text / attachments.base64），
 * 换成别的兼容服务商时改 MAIL_API_URL 即可。
 */

/** 单次请求的超时；备份附件可能要传一会儿，给得比一般接口宽。 */
const TIMEOUT_MS = 120_000

export type MailAttachment = {
  filename: string
  content: Buffer
}

/** 是否配好了发信通道；没配时整个「每月备份邮件」功能关闭。 */
export function mailConfigured(): boolean {
  return MAIL_API_KEY !== ''
}

export function backupMailRecipients(): string[] {
  return BACKUP_EMAIL_TO
}

/** 发一封带附件的邮件，非 2xx 直接抛错，由调用方决定是否重试。 */
export async function sendMail(input: {
  subject: string
  text: string
  attachment: MailAttachment
}): Promise<void> {
  const response = await fetch(MAIL_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MAIL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      from: MAIL_FROM,
      to: backupMailRecipients(),
      subject: input.subject,
      text: input.text,
      attachments: [
        {
          filename: input.attachment.filename,
          content: input.attachment.content.toString('base64'),
        },
      ],
    }),
  })

  if (!response.ok) {
    // 把服务商的报错原文截一段带上，配错 Key / 发件地址时能一眼看出原因
    const detail = await response.text().catch(() => '')
    throw new Error(`邮件接口返回 ${response.status}：${detail.slice(0, 500)}`)
  }
}
