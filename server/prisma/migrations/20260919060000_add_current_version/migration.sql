-- 当前版本指针：自动保存会同步更新它指向的那条版本快照。
-- 手写而非 migrate dev 生成，因为 session 表不在 schema.prisma 里，
-- migrate dev 的 drift 检测会试图删掉它。

ALTER TABLE "Resume" ADD COLUMN "currentVersionId" TEXT;

ALTER TABLE "Resume" ADD CONSTRAINT "Resume_currentVersionId_fkey"
    FOREIGN KEY ("currentVersionId") REFERENCES "ResumeVersion"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
