-- 限流计数表。key 形如 `login:ip:1.2.3.4`，windowStart 为窗口起点对齐后的时间戳。
-- 复合主键让「计数加一」能用一条 UPSERT 完成，多实例共享同一份计数。
--
-- 手写而非 migrate dev 生成，原因同前几个迁移：session 表不在 schema.prisma 里，
-- migrate dev 的 drift 检测会试图删掉它。

CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key", "windowStart")
);

CREATE INDEX "RateLimit_windowStart_idx" ON "RateLimit"("windowStart");