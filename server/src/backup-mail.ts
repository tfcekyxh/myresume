import { formatBytes, runBackupJob } from './backup-scheduler'
import { backupMailRecipients, mailConfigured } from './mail'

/**
 * 手动发一次备份邮件：`bun run backup:mail`
 *
 * 给部署后自检用——定时器要等到下个月才看得出来有没有生效，这条命令当场就能
 * 验证 Key、发件地址、收件人配得对不对。它走的是定时器完全相同的那条路径，
 * 所以发成功之后本月也不会再自动发第二封。
 */

if (!mailConfigured() || backupMailRecipients().length === 0) {
  console.error('未配置 MAIL_API_KEY 或收件人，请先补 server/.env（见 .env.example）')
  process.exit(1)
}

const { filename, month, bytes } = await runBackupJob()

console.log(`已发送 ${month} 的备份邮件：${filename}（${formatBytes(bytes)}）`)
