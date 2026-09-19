-- connect-pg-simple 在首次启动时自动建的会话表。
-- 把它补进 migration 历史，否则 Prisma 每次都会报 schema drift。
-- 库中该表已存在，本文件仅用于对齐历史，标记为已应用即可。

CREATE TABLE IF NOT EXISTS "session" (
    "sid" varchar NOT NULL COLLATE "default",
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL
);

ALTER TABLE "session" DROP CONSTRAINT IF EXISTS "session_pkey";
ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
