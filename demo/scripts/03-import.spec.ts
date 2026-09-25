import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from './fixtures'
import { ASSETS_DIR } from './constants'
import {
  moveAndClick,
  openEditDirectly,
  pause,
  prepareClip,
  scrollToTop,
  startClip,
  writeMarks,
} from './demo-utils'

/**
 * 片段 3：导入简历（走真实大模型）。
 *
 * 走的是真的 glm-4-flash，等多久不由我们决定，所以要记下「点解析」与
 * 「返回结果」的时间点，转码时把中间那段空等切掉。
 */
test.setTimeout(300_000)

test('03-import：导入简历（真实大模型解析）', async ({ page, context }) => {
  await prepareClip(context)

  await openEditDirectly(page)
  const importText = await readFile(resolve(ASSETS_DIR, 'import-sample.txt'), 'utf-8')

  await startClip(page, '03-import')
  // 记时基准取在开录之后，marks 才能直接当视频时间轴用
  const t0 = Date.now()

  await moveAndClick(page, page.getByTestId('import-resume-button'), 900)
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('导入简历', { exact: true })).toBeVisible()

  // 整段 fill 更贴近真实粘贴，也省时间
  await moveAndClick(page, page.getByLabel('简历文本'), 200)
  await page.getByLabel('简历文本').fill(importText)
  await pause(page, 900)

  const clickAt = Date.now()
  await moveAndClick(page, page.getByTestId('import-parse-button'), 0)
  // 真实模型可能跑到一分钟，不能按配置里 15s 的默认断言超时来等
  await expect(dialog.getByText('确认导入内容')).toBeVisible({ timeout: 120_000 })
  const doneAt = Date.now()

  await writeMarks('03-import', { waitStartMs: clickAt - t0, waitMs: doneAt - clickAt })
  await pause(page, 1300)

  // 预览摘要 → 确认整体覆盖
  await moveAndClick(page, page.getByTestId('import-confirm-button'), 1100)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('已导入简历内容，请核对各模块字段')).toBeVisible()
  await pause(page, 1200)

  // 滚回顶部展示被整体重写的表单
  await scrollToTop(page)
  await expect(page.getByLabel('姓名')).toHaveValue('陈晓')
  await expect(page.getByLabel('求职意向')).toHaveValue('全栈工程师')
  await pause(page, 1200)
})