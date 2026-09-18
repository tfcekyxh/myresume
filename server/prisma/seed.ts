import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { RESUME_MODULE_ORDER } from '@mymenu/shared'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// 从命令行读取 -u/-p，缺省用环境变量
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const username = arg('-u') ?? process.env.SEED_USERNAME ?? 'admin'
  const password = arg('-p') ?? process.env.SEED_PASSWORD

  if (!password) {
    throw new Error('必须提供密码：bunx prisma db seed -u <用户> -p <密码>，或设置 SEED_PASSWORD')
  }

  const passwordHash = await Bun.password.hash(password)
  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) {
    await prisma.user.update({
      where: { username },
      data: { passwordHash },
    })
    console.log(`账号 ${username} 已存在，已更新密码`)
  } else {
    await prisma.user.create({ data: { username, passwordHash } })
    console.log(`已创建账号 ${username}`)
  }

  console.log('模块顺序:', RESUME_MODULE_ORDER.join(' / '))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())