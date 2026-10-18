import path from 'node:path'
import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

/**
 * 注意两点：
 * 1. drizzle-kit 加载本文件时不会提供 `import.meta.dirname`（它是 undefined），
 *    所以路径一律用相对形式，基准是 cwd。命令统一从 server/ 目录执行
 *    （根目录的 npm script 走 `bun run --filter server`，cwd 天然就是 server/）。
 * 2. `schema` 与 `out` 必须给相对路径：给绝对路径时 drizzle-kit 会拼出
 *    `.//Users/...` 这种畸形路径，第二次 generate 时会读不到 meta 快照。
 */
const serverDir = process.cwd()

// drizzle-kit 不一定会自动加载 .env，这里显式读 server/.env
config({ path: path.join(serverDir, '.env') })

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.SQLITE_PATH || path.join(serverDir, 'data', 'app.sqlite'),
  },
})
