import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createSnapshot, stamp } from './backup'
import { SQLITE_PATH } from './env'
import { backupMailRecipients, mailConfigured, sendMail } from './mail'

/**
 * 每月把整库快照发一封邮件。
 *
 * 定时器每小时醒一次，只判断「本月是否已经发过」，没发过就补一次。
 * 直接定时到一个月后是不可靠的：部署重启、容器迁移都会把计时器清零，
 * 而月度任务一旦错过就是整整一个月的空档。改成「记月份 + 每次醒来补跑」之后，
 * 重启、宕机、漏跑都能自动补上，同一个月也不会重复发（已发月份落盘去重）。
 *
 * 状态不建表、落在库文件旁边的 JSON 里：新增表会改变迁移哈希，而备份导入是
 * 按迁移哈希做跨版本校验的（见 backup.ts 的 assertSameMigrations），
 * 那会把现有导出的备份文件全部判成「跨版本」而拒收。
 */

/** 状态文件跟着库文件走，部署时自然落在挂载的卷里，重启不丢。 */
const STATE_PATH = `${SQLITE_PATH}.backup-mail.json`

/** 醒来频率：足够及时地补跑，又不至于白烧 CPU。 */
const TICK_MS = 60 * 60 * 1000

/** 失败后的重试间隔。配错 Key 时靠它把日志压到每天 4 条。 */
const RETRY_MS = 6 * 60 * 60 * 1000

/** 首次检查的延迟：让迁移与监听先就位，别和冷启动抢资源。 */
const STARTUP_DELAY_MS = 30_000

type State = {
  /** 已成功发出的月份（北京时间的 YYYY-MM）。 */
  sentMonth?: string
  /** 上次尝试的时间戳（毫秒），失败后据此退避重试。 */
  lastAttemptAt?: number
  lastError?: string
}

function readState(): State {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as State
  } catch {
    // 首次运行本就没有这个文件；内容坏掉时最坏的后果也只是重发一封，不值得阻断流程
    return {}
  }
}

function writeState(state: State) {
  const tmp = `${STATE_PATH}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2))
  // 先写临时文件再改名，进程在中途被杀也不会留下半截 JSON
  renameSync(tmp, STATE_PATH)
}

/** 北京时间（使用者的实际时区）的月份键，服务器跑在 UTC 也不影响「哪个月」。 */
export function backupMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)

  const year = parts.find((part) => part.type === 'year')?.value ?? ''
  const month = parts.find((part) => part.type === 'month')?.value ?? ''

  return `${year}-${month}`
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 取一次整库快照并发出去，不管状态记录。失败直接抛错。 */
async function sendSnapshot() {
  const snapshot = createSnapshot()

  try {
    const content = readFileSync(snapshot.file)
    const filename = `mymenu-backup-${stamp()}.sqlite`
    const month = backupMonth()

    await sendMail({
      subject: `简历应用数据备份 ${month}`,
      text: [
        `附件是简历应用的整库快照（SQLite 单文件，${formatBytes(content.byteLength)}）。`,
        '',
        '还原方式：登录应用 →「数据备份」页 → 导入这个文件，会把当前整库整体覆盖。',
        '跨版本的备份会被拒收，请在版本一致时再还原。',
        '',
        '这封邮件由服务每月自动发送，同一个月只发一次。',
      ].join('\n'),
      attachment: { filename, content },
    })

    return { filename, month, bytes: content.byteLength }
  } finally {
    // 临时目录是这次备份创建的，发完（或出错）就删掉
    snapshot.cleanup()
  }
}

/**
 * 备份 + 发信 + 记账，是「发一次月度备份」的完整含义。
 * 手动触发（backup:mail）与定时器都走这里，保证两条路径行为一致。
 */
export async function runBackupJob() {
  try {
    const result = await sendSnapshot()
    // 记下月份之后，本月的定时器不会再发第二封
    writeState({ sentMonth: result.month, lastAttemptAt: Date.now() })

    return result
  } catch (err) {
    writeState({
      ...readState(),
      lastAttemptAt: Date.now(),
      lastError: (err as Error).message,
    })
    throw err
  }
}

/** 同一时刻只跑一个：慢请求不会叠上下一次 tick 的尝试。 */
let running = false

async function checkAndSend() {
  if (running) return

  const state = readState()
  if (state.sentMonth === backupMonth()) return
  if (state.lastAttemptAt && Date.now() - state.lastAttemptAt < RETRY_MS) return

  running = true

  try {
    const result = await runBackupJob()
    console.log(
      `[backup-mail] 已发送 ${result.month} 的备份：${result.filename}（${formatBytes(result.bytes)}）`,
    )
  } catch (err) {
    console.error(
      `[backup-mail] 本月备份邮件发送失败，${RETRY_MS / 60 / 60 / 1000} 小时后重试:`,
      err,
    )
  } finally {
    running = false
  }
}

/**
 * 启动每月备份。没配发信通道时静默关闭，不影响其它功能。
 *
 * 两个定时器都 unref：不拖住进程退出，本地开发 Ctrl+C 也不会被它们挡住。
 */
export function startBackupScheduler() {
  if (!mailConfigured() || backupMailRecipients().length === 0) {
    console.log('[backup-mail] 未配置 MAIL_API_KEY 或收件人，每月自动备份邮件功能关闭')
    return
  }

  const tick = () => void checkAndSend()

  // 冷启动也检查一次，补上重启/宕机期间漏掉的那次
  setTimeout(tick, STARTUP_DELAY_MS).unref()
  setInterval(tick, TICK_MS).unref()

  console.log(`[backup-mail] 每月自动备份已开启，收件人：${backupMailRecipients().join('、')}`)
}
