import { expect, test } from './fixtures'
import {
  dragHandleOnto,
  loginDemo,
  moveAndClick,
  moveTo,
  pause,
  prepareClip,
  scrollTo,
  startClip,
  typeSlowly,
} from './demo-utils'

/**
 * 片段 1：核心编辑流。
 *
 * 登录 → 简历列表 → 编辑页填表 → 新增教育经历 → 拖拽排序 → 整理工作要点。
 * 登录过程本身就是演示内容，所以录制从登录页开始；但先把页面打开再开录，
 * 免得视频开头是 about:blank 的白屏。
 */
test.use({ storageState: { cookies: [], origins: [] } })

test('01-editing：核心编辑流', async ({ page, context }) => {
  await prepareClip(context)

  await page.goto('/login')
  await startClip(page, '01-editing')

  await loginDemo(page)

  // 简历列表 → 打开那份示例简历
  await moveAndClick(page, page.getByRole('link', { name: /张伟的简历/ }), 900)
  await expect(page.getByRole('button', { name: '存档', exact: true })).toBeVisible()
  await pause(page, 500)

  // 基本信息：逐字输入，做出「在打字」的观感
  await typeSlowly(page, page.getByLabel('求职意向'), '资深前端工程师')

  // 教育经历：补一条
  await moveAndClick(page, page.getByRole('button', { name: '添加教育经历' }))
  await typeSlowly(page, page.getByLabel('学校').last(), '中国科学技术大学')
  await typeSlowly(page, page.getByLabel('专业').last(), '计算机技术')

  // 拖拽排序：把第 1 条拖到第 3 条的位置，新补的那条就排到了前面
  await dragHandleOnto(
    page,
    page.getByRole('button', { name: '拖拽排序：教育经历 1' }),
    page.getByRole('button', { name: '拖拽排序：教育经历 3' })
  )
  await expect(page.getByLabel('学校').first()).toHaveValue('武汉理工大学')

  // 工作经历要点：删掉一条看编号重排，再补一条
  await scrollTo(page, page.getByRole('button', { name: '添加要点' }).first())
  await moveAndClick(page, page.getByRole('button', { name: '删除要点 1' }).first(), 900)
  await moveAndClick(page, page.getByRole('button', { name: '添加要点' }).first())
  await typeSlowly(page, page.getByPlaceholder('描述一条内容').last(), '牵头搭建前端监控体系')

  // 停在写好的内容上收尾
  await moveTo(page, page.getByPlaceholder('描述一条内容').last(), 900)
})