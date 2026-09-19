import { expect, test } from '@playwright/test'
import { loginAsDefaultUser } from './helpers'

test('简历表单可填写基本信息', async ({ page }) => {
  await loginAsDefaultUser(page)

  await expect(page.getByRole('heading', { name: '编辑简历' })).toBeVisible()
  await expect(page.getByText('基本信息', { exact: true })).toBeVisible()
  await expect(page.getByText('教育经历', { exact: true })).toBeVisible()

  await page.getByLabel('姓名').fill('刘剑涛')
  await page.getByLabel('求职意向').fill('前端工程师')
  await expect(page.getByLabel('姓名')).toHaveValue('刘剑涛')
})

test('可新增并删除教育经历条目', async ({ page }) => {
  await loginAsDefaultUser(page)

  await page.getByRole('button', { name: '添加教育经历' }).click()
  await expect(page.getByLabel('学校')).toHaveCount(1)

  await page.getByLabel('学校').fill('某某大学')
  await expect(page.getByLabel('学校')).toHaveValue('某某大学')

  await page.getByRole('button', { name: '添加教育经历' }).click()
  await expect(page.getByLabel('学校')).toHaveCount(2)

  // 删除第一条
  await page.getByRole('button', { name: '删除：教育经历 1' }).click()
  await expect(page.getByLabel('学校')).toHaveCount(1)
})

test('工作经历可添加要点并可增删要点', async ({ page }) => {
  await loginAsDefaultUser(page)

  await page.getByRole('button', { name: '添加工作经历' }).click()
  await page.getByLabel('公司').fill('某科技公司')

  await page.getByRole('button', { name: '添加要点' }).click()
  await expect(page.getByText('暂无要点，点下方按钮添加')).not.toBeVisible()

  // 填一条，再增删验证
  const firstPoint = page.getByPlaceholder('描述一条内容')
  await firstPoint.fill('负责前端架构')
  await page.getByRole('button', { name: '添加要点' }).click()
  await expect(page.getByPlaceholder('描述一条内容')).toHaveCount(2)
  await page.getByRole('button', { name: '删除要点 1' }).click()
  await expect(page.getByPlaceholder('描述一条内容')).toHaveCount(1)
})

test('拖拽可调整条目顺序，表单值顺序与界面一致', async ({ page }) => {
  await loginAsDefaultUser(page)

  const add = page.getByRole('button', { name: '添加教育经历' })
  await add.click()
  await add.click()

  await page.getByLabel('学校').first().fill('A大学')
  await page.getByLabel('学校').nth(1).fill('B大学')

  // 鼠标拖拽：把手柄 1 拖到条目 2 的位置
  const from = await page.getByRole('button', { name: '拖拽排序：教育经历 1' }).boundingBox()
  const to = await page.getByRole('button', { name: '拖拽排序：教育经历 2' }).boundingBox()
  if (!from || !to) throw new Error('拖拽手柄不可见')

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2, { steps: 15 })
  await page.mouse.up()

  await expect(page.getByLabel('学校').first()).toHaveValue('B大学')

  // 展开调试面板，确认表单值顺序也跟着变了
  await page.getByText('表单数据（调试用）').click()
  const data = JSON.parse(await page.locator('pre').innerText())
  expect(data.education.map((item: { school: string }) => item.school)).toEqual([
    'B大学',
    'A大学',
  ])
})