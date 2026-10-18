import { sql } from 'drizzle-orm'
import type { ResumeData } from '@mymenu/shared'
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core'

/**
 * SQLite 表结构。表名与列名沿用原来 Prisma 的写法（模型名即表名、字段名即列名），
 * 这样迁移前后的库文件、以及备份文件的格式是同一套约定。
 *
 * 时间列一律用 integer + mode: 'timestamp_ms' 存毫秒数：bun:sqlite 不能绑定 JS Date 对象，
 * 交给 Drizzle 做往返转换才安全。
 *
 * Resume.photoId 与 Photo.resumeId 互相引用，必须给指向后声明的那个回调写上
 * 返回类型 `AnySQLiteColumn`，否则 TypeScript 会因循环推断报 TS7022。
 */

/** 时间列的默认值：库内的 unixepoch() 是秒，乘 1000 转毫秒。 */
const nowMs = sql`(unixepoch() * 1000)`

export const users = sqliteTable('User', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  username: text('username').notNull().unique(),
  passwordHash: text('passwordHash').notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().default(nowMs),
})

export const photos = sqliteTable(
  'Photo',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    resumeId: text('resumeId')
      .notNull()
      .references((): AnySQLiteColumn => resumes.id, { onDelete: 'cascade' }),
    /** base64 的 JPEG，不含 data URL 前缀。photos 只增不删。 */
    data: text('data').notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().default(nowMs),
  },
  (t) => [index('Photo_resumeId_idx').on(t.resumeId)],
)

export const resumes = sqliteTable(
  'Resume',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('我的简历'),
    /** 草稿，编辑时自动保存覆盖它。 */
    data: text('data', { mode: 'json' }).$type<ResumeData>().notNull().default(sql`'{}'`),
    photoId: text('photoId').references((): AnySQLiteColumn => photos.id, {
      onDelete: 'set null',
    }),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
      .notNull()
      .default(nowMs)
      .$onUpdate(() => new Date()),
    /** 草稿最近一次被存档时的 updatedAt；比 updatedAt 旧即说明有未存档改动 */
    lastArchivedAt: integer('lastArchivedAt', { mode: 'timestamp_ms' }),
  },
  (t) => [index('Resume_userId_idx').on(t.userId)],
)

export const resumeVersions = sqliteTable(
  'ResumeVersion',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    resumeId: text('resumeId')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    /** 只读快照，只在点「存档」时产生 */
    snapshot: text('snapshot', { mode: 'json' }).$type<ResumeData>().notNull(),
    photoId: text('photoId').references(() => photos.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().default(nowMs),
  },
  (t) => [index('ResumeVersion_resumeId_idx').on(t.resumeId)],
)

/**
 * 限流计数。key 形如 `login:ip:1.2.3.4`，windowStart 是窗口起点对齐后的时间。
 * 复合主键让「加一」能用一条 UPSERT 完成。
 */
export const rateLimits = sqliteTable(
  'RateLimit',
  {
    key: text('key').notNull(),
    windowStart: integer('windowStart', { mode: 'timestamp_ms' }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.windowStart] }),
    index('RateLimit_windowStart_idx').on(t.windowStart),
  ],
)

/**
 * 会话表。由本应用自己管理（原来那张表是 connect-pg-simple 建的），
 * sid 是 cookie 里的会话 id，sess 是序列化后的会话数据。
 */
export const sessions = sqliteTable(
  'Session',
  {
    sid: text('sid').primaryKey(),
    sess: text('sess', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    expire: integer('expire', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('Session_expire_idx').on(t.expire)],
)
