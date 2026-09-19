import { expect, test } from '@playwright/test'
import { setupResumeForEdit } from './helpers'

// 多简历之后，每个用例从「只有一份干净简历」的编辑页出发
test.beforeEach(async ({ page }) => {
  await setupResumeForEdit(page)
})

test('简历表单可填写基本信息', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '测试简历' })).toBeVisible()
  await expect(page.getByText('基本信息', { exact: true })).toBeVisible()
  await expect(page.getByText('教育经历', { exact: true })).toBeVisible()

  await page.getByLabel('姓名').fill('刘剑涛')
  await page.getByLabel('求职意向').fill('前端工程师')
  await expect(page.getByLabel('姓名')).toHaveValue('刘剑涛')
})

test('可新增并删除教育经历条目', async ({ page }) => {
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

test('多行文本框随输入自动增高，内容多时无需框内滚动', async ({ page }) => {
  // 添加技能，找到它的多行输入框
  await page.getByRole('button', { name: '添加技能' }).click()
  const box = page.getByPlaceholder('如 熟悉 TypeScript / React，有大型前端项目经验')
  await expect(box).toBeVisible()

  const heightBefore = await box.evaluate((el) => el.getBoundingClientRect().height)

  // 输入多行内容后高度应明显增长，且不出现内部纵向滚动条
  await box.fill(Array.from({ length: 8 }, (_, i) => `第${i + 1}行内容`).join('\n'))
  const heightAfter = await box.evaluate((el) => el.getBoundingClientRect().height)
  expect(heightAfter).toBeGreaterThan(heightBefore)

  const scrollable = await box.evaluate(
    (el) => el.scrollHeight > el.clientHeight + 1
  )
  expect(scrollable).toBe(false)

  // 程序性赋值（不走 input 事件）也要跟着撑高：走调试面板写回一段长文本
  await page.getByText('表单数据（调试用）').click()
  await page.getByRole('button', { name: '编辑' }).click()
  const json = page.getByLabel('表单数据')
  const data = JSON.parse(await json.inputValue())
  data.skills[0].text = Array.from({ length: 12 }, (_, i) => `写回的第${i + 1}行`).join('\n')
  await json.fill(JSON.stringify(data, null, 2))
  await page.getByRole('button', { name: '应用' }).click()

  await expect(box).toHaveValue(data.skills[0].text)
  const heightAfterApply = await box.evaluate((el) => el.getBoundingClientRect().height)
  expect(heightAfterApply).toBeGreaterThan(heightAfter)
  expect(await box.evaluate((el) => el.scrollHeight > el.clientHeight + 1)).toBe(false)
})

test('可在表单数据面板编辑 JSON 并写回表单', async ({ page }) => {
  await page.getByRole('button', { name: '添加教育经历' }).click()
  await page.getByLabel('学校').fill('A大学')

  await page.getByText('表单数据（调试用）').click()
  await page.getByRole('button', { name: '编辑' }).click()
  const json = page.getByLabel('表单数据')

  // 非法 JSON 被拒绝：保留编辑态和输入
  await json.fill('{ 这不是合法 JSON')
  await page.getByRole('button', { name: '应用' }).click()
  await expect(page.getByText('JSON 格式有误，请检查后再应用')).toBeVisible()
  await expect(json).toHaveValue('{ 这不是合法 JSON')

  // 重新进入编辑态拿到当前表单值，改成合法 JSON：改第一条学校，再加一条教育经历
  await page.getByRole('button', { name: '取消' }).click()
  await page.getByRole('button', { name: '编辑' }).click()
  const data = JSON.parse(await json.inputValue())
  data.education[0].school = 'C大学'
  data.education.push({ ...data.education[0], school: 'D大学' })
  await json.fill(JSON.stringify(data, null, 2))

  await page.getByRole('button', { name: '应用' }).click()

  // 回到只读态，表单字段同步更新
  await expect(page.getByRole('button', { name: '编辑' })).toBeVisible()
  await expect(page.getByLabel('学校')).toHaveCount(2)
  await expect(page.getByLabel('学校').first()).toHaveValue('C大学')
  await expect(page.getByLabel('学校').nth(1)).toHaveValue('D大学')
})