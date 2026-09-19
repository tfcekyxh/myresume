-- 回退「自动保存同步写入当前版本」的设计：
-- 版本恢复为只读快照，草稿是唯一的工作区，两者不再需要指针关联。

ALTER TABLE "Resume" DROP CONSTRAINT IF EXISTS "Resume_currentVersionId_fkey";
ALTER TABLE "Resume" DROP COLUMN IF EXISTS "currentVersionId";
