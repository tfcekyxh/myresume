import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('缺少 DATABASE_URL，请检查 server/.env')
}

const adapter = new PrismaPg({ connectionString })

export const prisma = new PrismaClient({ adapter })
