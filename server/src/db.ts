import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { SQLITE_PATH } from './env'

/** 迁移产物目录，与 drizzle.config.ts 的 out 保持一致。 */
export const MIGRATIONS_FOLDER = path.join(import.meta.dirname, '..', 'drizzle')

/** 打开（必要时创建）一个库文件，并把并发与约束开关设好。 */
function open(file: string) {
  // SQLite 不会替我们建目录，首次启动或挂载新卷时都要先补上
  mkdirSync(path.dirname(file), { recursive: true })

  const sqlite = new Database(file, { create: true })
  // SQLite 默认不校验外键，简历/照片/版本的级联删除全靠这一行
  sqlite.exec('PRAGMA foreign_keys = ON')
  // 单文件库，允许多连接并发读，写操作自己排队
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec('PRAGMA busy_timeout = 5000')

  return { sqlite, db: drizzle({ client: sqlite }) }
}

const opened = open(SQLITE_PATH)

/**
 * 当前连接与 drizzle 实例。
 *
 * 全程只有一个连接、一个库文件，导入备份也不换文件（见 backup.ts 的还原实现），
 * 所以这里可以是 const：一旦动过这个连接，进程里所有模块都会看到同一个它。
 */
export const sqlite = opened.sqlite
export const db = opened.db

/**
 * 启动即补跑迁移。
 *
 * 单机自部署只有一个进程、不存在多实例抢迁移的问题，所以不需要 pre-deploy 阶段：
 * 开机自愈最省事，换台机器把库文件拷过去再启动也能自动补齐结构。
 */
migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
