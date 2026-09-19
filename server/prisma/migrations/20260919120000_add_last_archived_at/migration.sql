-- 记录草稿最近一次被存档时的 updatedAt：
-- lastArchivedAt 为 NULL 或早于 updatedAt，说明草稿有未存档的改动。

ALTER TABLE "Resume" ADD COLUMN "lastArchivedAt" TIMESTAMP(3);
