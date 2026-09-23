import { expect, test, type Page } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { clearRateLimits, deleteUsersByUsername, disconnectDb } from './db'
import { USERNAME } from './helpers'

/**
 * 接口限流（生产级阈值）。
 *
 * 只走真实浏览器 + 真实后端，断言聚焦用户可见的提示文案。
 * 限流计数落在数据库里，用例本身就要反复登录/注册，
 * 必须从零开始，否则会撞上生产阈值把自己挡在门外。
 */

// 登录限流是每 IP 每 15 分钟 10 次，注册是每 IP 每小时 2 次，均按 IP 计数
test.beforeEach(async () => {
  await clearRateLimits()
})

test.describe('登录限流', () => {
  test('用错误密码连续登录会被限流', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('用户名').fill(USERNAME)
    await page.getByLabel('密码').fill('definitely-wrong-password')

    // 阈值是 10 次，前 10 次都被允许，仍提示「用户名或密码错误」
    for (let i = 0; i < 10; i++) {
      await submitLogin(page)
    }
    await expect(page.getByText('用户名或密码错误')).toBeVisible()

    // 第 11 次超出窗口配额，被限流
    await submitLogin(page)
    await expect(page.getByText('登录尝试过于频繁，请稍后再试')).toBeVisible()
  })
})

test.describe('注册限流', () => {
  // 本次运行创建的账号，afterAll 统一删除（简历随用户级联删除）
  const createdUsernames: string[] = []
  const PASSWORD = 'rate-limit-pw-123'

  test.afterAll(async () => {
    await deleteUsersByUsername(createdUsernames)
    await disconnectDb()
  })

  test('连续注册成功后第三次会被限流', async ({ page }) => {
    // 阈值是 1 小时 2 次：前两次注册成功并自动登录
    for (let i = 0; i < 2; i++) {
      const username = uniqueUsername()
      createdUsernames.push(username)

      await openRegister(page)
      await fillRegisterForm(page, username, PASSWORD)
      await page.getByRole('button', { name: '注册', exact: true }).click()
      await expect(page).toHaveURL('/resumes')

      await page.getByRole('button', { name: '登出' }).click()
      await expect(page).toHaveURL('/login')
    }

    // 第三次（换了新的合法用户名）在进入业务逻辑前就被限流
    const username = uniqueUsername()
    createdUsernames.push(username)
    await openRegister(page)
    await fillRegisterForm(page, username, PASSWORD)
    await page.getByRole('button', { name: '注册', exact: true }).click()
    await expect(page.getByText('注册过于频繁，请稍后再试')).toBeVisible()
  })
})

/** 点「登录」并等这次登录请求完成，避免用上一次的错误提示误判。 */
async function submitLogin(page: Page) {
  const done = page.waitForResponse(
    (res) => res.request().method() === 'POST' && res.url().includes('/api/auth/login'),
  )
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await done
}

function uniqueUsername(): string {
  return `e2e-ratelimit-${randomBytes(4).toString('hex')}`
}

/** 打开登录页并切到注册模式。 */
async function openRegister(page: Page) {
  await page.goto('/login')
  await page.getByRole('button', { name: '立即注册' }).click()
  await expect(page.getByLabel('确认密码')).toBeVisible()
}

async function fillRegisterForm(page: Page, username: string, password: string) {
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByLabel('确认密码').fill(password)
}