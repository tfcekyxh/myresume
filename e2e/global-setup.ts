import { disconnectDb, ensureTestUser } from './db'

/**
 * 跑测试前确保专用测试账号存在。
 *
 * 用例会清空该账号的简历，所以必须与真实账号隔离，
 * 否则一次 e2e 就会把用户自己的简历删掉。
 */
export default async function globalSetup() {
  const username = process.env.E2E_USERNAME ?? 'e2e-tester'
  const password = process.env.E2E_PASSWORD ?? 'e2e-tester'

  await ensureTestUser(username, password)
  await disconnectDb()
}
