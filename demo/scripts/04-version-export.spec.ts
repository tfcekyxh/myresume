import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { DOWNLOADS_DIR, SEEDED_VERSION_NOTE } from './constants'
import {
  moveAndClick,
  moveTo,
  openEditDirectly,
  pause,
  prepareClip,
  scrollToTop,
  startClip,
  typeSlowly,
} from './demo-utils'

/**
 * 触发导出并把产物落盘。
 *
 * 下载由浏览器接管，Playwright 只录页面像素、录不到浏览器的下载栏，
 * 页面内也确实没有任何成功提示（见产品实现）。所以画面里能看到的只有
 * 「导出中…」这一段；这里把文件存下来，至少保证导出真的成功了。
 * 不在页面里伪造提示 UI。
 */
async function exportAndSave(page: Page, button: Locator) {
  const downloadPromise = page.waitForEvent('download')
  await moveAndClick(page, button, 0)
  const download = await downloadPromise

  await mkdir(DOWNLOADS_DIR, { recursive: true })
  await download.saveAs(resolve(DOWNLOADS_DIR, download.suggestedFilename()))
  console.log(`[demo] 已导出 ${download.suggestedFilename()}`)
  await pause(page, 1400)
}

/**
 * 片段 4：版本存档 / 恢复 + 导出。
 *
 * 恢复的演示效果依赖 seed 预置的那份「更早的修订版」快照 ——
 * 内容与当前草稿不同，恢复后表单会明显变样。
 */
test('04-version-export：存档 / 恢复 + 导出', async ({ page, context }) => {
  await prepareClip(context)
  await openEditDirectly(page)
  await startClip(page, '04-version-export')

  // 存档：填备注 → 确认
  await moveAndClick(page, page.getByRole('button', { name: '存档', exact: true }), 800)
  await typeSlowly(page, page.locator('#version-note'), '更新项目经历后存档')
  await moveAndClick(page, page.getByRole('button', { name: '确认存档' }), 1300)

  // 切到版本页：新版本出现在列表顶部，「当前草稿」的徽标变成已存档
  await moveAndClick(page, page.getByRole('link', { name: '已归档的简历版本' }), 1100)
  await expect(page.getByTestId('draft-badge')).toHaveText('已存档')
  await expect(page.getByText('更新项目经历后存档')).toBeVisible()
  await pause(page, 1000)

  // 恢复到 seed 预置的那条旧快照
  const oldRow = page.locator('li').filter({ hasText: SEEDED_VERSION_NOTE })
  await expect(oldRow).toHaveCount(1)
  await moveAndClick(page, oldRow.getByRole('button', { name: '恢复' }), 800)
  await expect(page.getByRole('alertdialog')).toContainText('恢复到这个版本？')
  await pause(page, 900)
  await moveAndClick(page, page.getByRole('button', { name: '确认恢复' }), 1300)

  // 恢复是整页跳回编辑页；跳转后必须走一次 moveTo，否则自绘光标要等
  // 第一次鼠标移动才会重新出现
  await expect(page.getByRole('button', { name: '存档', exact: true })).toBeVisible()
  await scrollToTop(page, 800)
  await expect(page.getByLabel('求职意向')).toHaveValue('前端开发工程师')
  await moveTo(page, page.getByLabel('求职意向'), 900)

  await exportAndSave(page, page.getByRole('button', { name: '导出 Word' }))
  await exportAndSave(page, page.getByRole('button', { name: '导出 PDF' }))
})