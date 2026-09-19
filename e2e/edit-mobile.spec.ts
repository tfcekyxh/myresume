import { expect, test } from '@playwright/test'
import { loginAsDefaultUser, createResume, openEdit } from './helpers'

// 手机视口（iPhone 尺寸）下验证编辑页的「手机优先」样式生效：
// 单列栅格、无横向溢出、关键操作按钮仍可见。
test.use({ viewport: { width: 390, height: 844 } })

test('手机宽度下编辑页不横向溢出，基本信息为单列', async ({ page }) => {
  await loginAsDefaultUser(page)
  const id = await createResume(page, '手机简历')
  await openEdit(page, id)

  // 手机工具栏在换行后仍能看到关键操作按钮
  await expect(page.getByRole('button', { name: '存档', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '导出 Word', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '我的简历' })).toBeVisible()
  await expect(page.getByRole('button', { name: '登出' })).toBeVisible()

  // 页面无横向溢出：文档滚动宽度不超过可视宽度
  const { clientWidth, scrollWidth } = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)

  // 手机布局生效：基本信息栅格是单列，姓名字段宽度接近内容区而非半宽
  const nameWidth = await page
    .getByLabel('姓名')
    .evaluate((el) => el.getBoundingClientRect().width)
  const contentWidth = clientWidth - 32 // 容器 px-4，左右各 16px
  expect(nameWidth).toBeGreaterThan(contentWidth * 0.8)
})