import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Database } from 'bun:sqlite'
import { sqlite } from './db'
import { SQLITE_PATH } from './env'

/**
 * 整库备份的导出与还原。
 *
 * 导出用 `VACUUM INTO`：SQLite 官方推荐的备份方式，产出的是一致快照，
 * 而且不像 VACUUM 那样需要写锁——正在写入时也能安全地取一份。
 * 直接拷 .sqlite 文件是不行的，WAL 里可能还压着没落盘的事务。
 *
 * 还原**不换库文件**，走纯 SQL：ATTACH 上传的文件，在一个事务里清空再整表搬过来。
 * 试过「断开连接 → 覆盖文件 → 重连」，在 Bun 下走不通：drizzle 会缓存
 * prepared statement，而 sqlite3_close_v2 在还有未 finalize 的语句时并不会真正
 * 关闭连接，旧句柄会继续握着文件锁，重连时报 SQLITE_BUSY。
 * 换成 SQL 还原之后顺带还拿到了原子性：中途失败直接回滚，库不会停在半截状态。
 */

/** 上传的文件不是本应用能用的备份时抛出，路由据此返回 400。 */
export class InvalidSnapshotError extends Error {}

/** 整库还原时要覆盖的表。顺序无关紧要，外键在复制期间是关的。 */
const TABLES = ['User', 'Resume', 'Photo', 'ResumeVersion', 'RateLimit', 'Session'] as const

/** 快照里必须有的列，用来挡住「不是本应用的库」和跨版本的库。 */
const REQUIRED_COLUMNS: Record<(typeof TABLES)[number], string[]> = {
  User: ['id', 'username', 'passwordHash', 'createdAt'],
  Resume: ['id', 'userId', 'title', 'data', 'photoId', 'updatedAt', 'lastArchivedAt'],
  Photo: ['id', 'resumeId', 'data', 'createdAt'],
  ResumeVersion: ['id', 'resumeId', 'snapshot', 'photoId', 'note', 'createdAt'],
  RateLimit: ['key', 'windowStart', 'count'],
  Session: ['sid', 'sess', 'expire'],
}

/** 交给前端在二次确认弹窗里展示的内容摘要。 */
export type SnapshotSummary = {
  users: number
  resumes: number
  photos: number
  versions: number
}

/** 临时文件名 / 备份文件名里的时间戳。 */
export function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/** 拼进 SQL 的路径要转义单引号，免得路径里的引号把语句撑开。 */
function quote(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

/** 取当前库的一致快照并写到 file，目标文件必须不存在。 */
function vacuumInto(file: string) {
  sqlite.exec(`VACUUM INTO ${quote(file)}`)
}

/**
 * 导出：在当前库的一致快照上落一个文件。
 * 调用方负责调 cleanup 删掉临时目录。
 */
export function createSnapshot(): { file: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'mymenu-backup-'))
  const cleanup = () => rmSync(dir, { recursive: true, force: true })

  try {
    const file = path.join(dir, 'backup.sqlite')
    vacuumInto(file)
    return { file, cleanup }
  } catch (err) {
    cleanup()
    throw err
  }
}

/**
 * 校验上传的文件是不是本应用能用的备份。
 *
 * 除了完整性，还比对两边 `__drizzle_migrations` 的迁移记录：
 * 结构不一致的库搬进来，后续查询会直接报错，宁可在这里拒掉。
 */
export function inspectSnapshot(file: string): SnapshotSummary {
  let source: Database
  try {
    source = new Database(file, { readonly: true })
  } catch {
    throw new InvalidSnapshotError('无法打开这个文件，它可能不是 SQLite 数据库')
  }

  try {
    const integrity = source
      .query<{ integrity_check: string }, []>('PRAGMA integrity_check')
      .get()

    if (!integrity || integrity.integrity_check !== 'ok') {
      throw new InvalidSnapshotError('文件完整性校验未通过，可能已经损坏')
    }

    assertSchema(source)
    assertSameMigrations(source)

    return {
      users: countRows(source, 'User'),
      resumes: countRows(source, 'Resume'),
      photos: countRows(source, 'Photo'),
      versions: countRows(source, 'ResumeVersion'),
    }
  } catch (err) {
    if (err instanceof InvalidSnapshotError) throw err
    throw new InvalidSnapshotError(`不是可用的备份文件：${(err as Error).message}`)
  } finally {
    source.close()
  }
}

function assertSchema(source: Database) {
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const found = new Set(
      source
        .query<{ name: string }, []>(`PRAGMA table_info(${quote(table)})`)
        .all()
        .map((row) => row.name),
    )

    if (found.size === 0) {
      throw new InvalidSnapshotError(`备份里缺少 ${table} 表，可能不是本应用导出的文件`)
    }

    const missing = columns.filter((column) => !found.has(column))
    if (missing.length > 0) {
      throw new InvalidSnapshotError(
        `${table} 表缺少 ${missing.join('、')} 字段，与当前版本不一致`,
      )
    }
  }
}

function assertSameMigrations(source: Database) {
  const current = migrationHashes(sqlite)
  const incoming = migrationHashes(source)

  if (current.length === 0 || current.join() !== incoming.join()) {
    throw new InvalidSnapshotError('备份文件来自不同的版本，请用与当前版本一致的导出文件还原')
  }
}

function migrationHashes(database: Database): string[] {
  return database
    .query<{ hash: string }, []>('SELECT hash FROM "__drizzle_migrations" ORDER BY created_at')
    .all()
    .map((row) => row.hash)
}

function countRows(source: Database, table: string): number {
  const row = source.query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM ${quote(table)}`).get()

  return Number(row?.n ?? 0)
}

/**
 * 用上传的文件整体覆盖当前库。
 *
 * 顺序：校验（不合格就在什么都没动的情况下报错）→ 把当前库另存一份快照（不可撤销，留后路）
 * → ATTACH 上传的文件，在一个事务里清空 + 整表搬过来 → 外键自检通过才提交。
 */
export function restoreFrom(uploadedFile: string): {
  summary: SnapshotSummary
  backupFile: string
} {
  const summary = inspectSnapshot(uploadedFile)

  // 留一份当前库的一致快照；比直接拷 .sqlite 文件靠谱（不会漏掉 WAL 里的事务）
  const backupFile = `${SQLITE_PATH}.bak-${stamp()}`
  vacuumInto(backupFile)

  sqlite.exec(`ATTACH DATABASE ${quote(uploadedFile)} AS incoming`)

  try {
    // Resume.photoId 与 Photo.resumeId 互相引用，排不出让外键在每一步都成立的插入顺序，
    // 所以搬运期间关掉外键校验，搬完用 foreign_key_check 兜底。
    // 注意 PRAGMA 在事务里会被忽略，必须在 BEGIN 之前设置。
    sqlite.exec('PRAGMA foreign_keys = OFF')
    sqlite.exec('BEGIN')

    try {
      for (const table of TABLES) sqlite.exec(`DELETE FROM main.${quote(table)}`)
      for (const table of TABLES) {
        sqlite.exec(`INSERT INTO main.${quote(table)} SELECT * FROM incoming.${quote(table)}`)
      }

      const violations = sqlite.query('PRAGMA foreign_key_check').all()
      if (violations.length > 0) {
        throw new InvalidSnapshotError('备份里的数据自相矛盾，外键校验未通过')
      }

      sqlite.exec('COMMIT')
    } catch (err) {
      sqlite.exec('ROLLBACK')
      throw err
    } finally {
      sqlite.exec('PRAGMA foreign_keys = ON')
    }
  } finally {
    sqlite.exec('DETACH DATABASE incoming')
  }

  return { summary, backupFile }
}
