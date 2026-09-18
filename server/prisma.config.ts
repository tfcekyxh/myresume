import path from 'node:path'
import { config } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

// Prisma CLI 不会自动加载 .env，显式读取 server/.env
config({ path: path.join(import.meta.dirname, '.env') })

export default defineConfig({
  schema: path.join(import.meta.dirname, 'prisma', 'schema.prisma'),
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    path: path.join(import.meta.dirname, 'prisma', 'migrations'),
    seed: 'bun prisma/seed.ts',
  },
})