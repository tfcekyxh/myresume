import { expect, test } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { clearRateLimits, deleteUsersByUsername, disconnectDb, ensureTestUser } from './db'

// 注册用例专用随机用户名，与 e2e-tester 账号完全隔离
const uniqueUsername = () => `e2e-register-${randomBytes(4).toString('hex')}`
const PASSWORD = 'register-pw-123'

// 本次运行创建的账号，afterAll 统一删除（简历随用户级联删除）
const createdUsernames: string[] = []

// 注册限流是每 IP 每小时 2 次，用例本身就要走几次注册，必须从零开始
test.beforeEach(async () => {
  await clearRateLimits()
})

test.afterAll(async () => {
  await deleteUsersByUsername(createdUsernames)
  await disconnectDb()
})

test('注册成功后自动登录，登出后可用该账号重新登录', async ({ page }) => {
  const username = uniqueUsername()
  createdUsernames.push(username)

  await page.goto('/login')

  // 登录模式 → 注册模式 → 切回登录 → 再切到注册，验证卡片双向切换
  await page.getByRole('button', { name: '立即注册' }).click()
  await expect(page.locator('[data-slot="card-title"]')).toHaveText('注册')
  await expect(page.getByText('创建账号后开始编辑简历')).toBeVisible()
  await expect(page.getByRole('button', { name: '注册', exact: true })).toBeVisible()
  // 确认密码只在注册模式出现
  await expect(page.getByLabel('确认密码')).toBeVisible()

  await page.getByRole('button', { name: '去登录' }).click()
  await expect(page.locator('[data-slot="card-title"]')).toHaveText('登录')
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
  await expect(page.getByLabel('确认密码')).not.toBeAttached()

  await page.getByRole('button', { name: '立即注册' }).click()
  await expect(page.getByLabel('确认密码')).toBeVisible()

  // 提交注册：成功后自动登录；新用户没有简历，应落到简历列表页
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
  await page.getByLabel('确认密码').fill(PASSWORD)
  await page.getByRole('button', { name: '注册', exact: true }).click()

  await expect(page).toHaveURL('/resumes')
  await expect(page.getByText(username)).toBeVisible()
  await expect(page.getByText('还没有简历，先建一份吧。')).toBeVisible()

  // 登出后，在登录模式下用刚注册的账号重新登录
  await page.getByRole('button', { name: '登出' }).click()
  await expect(page).toHaveURL('/login')

  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: '登录', exact: true }).click()

  await expect(page).toHaveURL('/resumes')
  await expect(page.getByText(username)).toBeVisible()
})

test('注册字段内联校验与用户名占用提示', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: '立即注册' }).click()

  // 用户名不足 3 位（密码与确认密码合法且一致，只触发用户名错误）
  await page.getByLabel('用户名').fill('ab')
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
  await page.getByLabel('确认密码').fill(PASSWORD)
  await page.getByRole('button', { name: '注册', exact: true }).click()
  await expect(page.getByText('用户名至少 3 个字符')).toBeVisible()
  await expect(page).toHaveURL('/login')

  // 密码不足 6 位（换合法用户名，确认密码与密码保持一致，只触发密码错误）
  await page.getByLabel('用户名').fill(uniqueUsername())
  await page.getByLabel('密码', { exact: true }).fill('12345')
  await page.getByLabel('确认密码').fill('12345')
  await page.getByRole('button', { name: '注册', exact: true }).click()
  await expect(page.getByText('密码至少 6 个字符')).toBeVisible()

  // 用户名已被占用：先用 db 辅助造一个同名账号，再走 UI 注册
  const taken = uniqueUsername()
  createdUsernames.push(taken)
  await ensureTestUser(taken, PASSWORD)

  await page.getByLabel('用户名').fill(taken)
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
  await page.getByLabel('确认密码').fill(PASSWORD)
  await page.getByRole('button', { name: '注册', exact: true }).click()
  await expect(page.getByText('用户名已被占用')).toBeVisible()
  await expect(page).toHaveURL('/login')

  // 确认密码留空（用户名、密码合法，只触发确认密码必填错误，不发起注册）
  await page.getByLabel('用户名').fill(uniqueUsername())
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
  await page.getByLabel('确认密码').fill('')
  await page.getByRole('button', { name: '注册', exact: true }).click()
  await expect(page.getByText('请再次输入密码')).toBeVisible()
  await expect(page).toHaveURL('/login')

  // 两次密码不一致（确认密码非空但不同，只触发不一致错误，不发起注册）
  await page.getByLabel('用户名').fill(uniqueUsername())
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
  await page.getByLabel('确认密码').fill('different-pw-456')
  await page.getByRole('button', { name: '注册', exact: true }).click()
  await expect(page.getByText('两次输入的密码不一致')).toBeVisible()
  await expect(page).toHaveURL('/login')
})
