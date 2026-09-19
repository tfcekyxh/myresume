import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { config } from 'dotenv'
import { resolve } from 'node:path'

/**
 * 测试专用数据库访问。
 *
 * 只用来构造/校验前置状态（照片会真实落库，且业务上没有删除照片的接口），
 * 不做接口级断言。测试从仓库根运行，cwd 下没有 .env，显式加载 server/.env。
 */
config({ path: resolve(process.cwd(), 'server/.env') })

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('缺少 DATABASE_URL，请检查 server/.env')
}

let client: PrismaClient | null = null

/** 惰性建连接。Prisma 7 运行时必须显式传 pg 驱动适配器。 */
function getPrisma(): PrismaClient {
  client ??= new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  return client
}

/** 测试结束调用，避免连接池让测试进程挂住。 */
export async function disconnectDb() {
  if (client) {
    await client.$disconnect()
    client = null
  }
}

/** 把简历的当前照片置空（photos 行保留，业务上只增不删）。 */
export async function clearResumePhoto(resumeId: string) {
  await getPrisma().resume.update({
    where: { id: resumeId },
    data: { photoId: null },
  })
}

/** 简历名下的 photos 行数。 */
export function countResumePhotos(resumeId: string) {
  return getPrisma().photo.count({ where: { resumeId } })
}
