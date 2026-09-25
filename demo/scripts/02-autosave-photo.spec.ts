import { expect, test } from './fixtures'
import {
  moveTo,
  openEditDirectly,
  pause,
  prepareClip,
  slowDown,
  startClip,
  typeSlowly,
} from './demo-utils'
import { resolvePhotoBuffer } from './photo'

/**
 * 片段 2：草稿自动保存 + 证件照上传。
 *
 * 这两件事的中间态都很短（草稿 debounce 1s 后几乎秒回，压缩阶段更是
 * 完全没有 UI 提示），所以用只延迟响应的 route 把它们放大到看得清。
 */
test('02-autosave-photo：草稿自动保存 + 照片上传', async ({ page, context }) => {
  await prepareClip(context)
  await slowDown(page, '**/api/resumes/*/draft', 700)
  await slowDown(page, '**/api/resumes/*/photo', 900)

  await openEditDirectly(page)
  await startClip(page, '02-autosave-photo')

  // 改个字段 → 状态条从「保存中…」走到「已保存」
  await typeSlowly(page, page.getByLabel('电话'), '13800138001', 40, 150)
  await expect(page.getByTestId('save-status')).toHaveText('保存中…')
  await pause(page, 700)
  await expect(page.getByTestId('save-status')).toHaveText('已保存')
  await pause(page, 900)

  // 上传证件照：setInputFiles 绕过系统文件弹窗，光标先滑到按钮上
  await moveTo(page, page.getByRole('button', { name: '选择照片' }))
  await page.getByTestId('photo-input').setInputFiles({
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    buffer: await resolvePhotoBuffer(page),
  })

  await expect(page.getByRole('button', { name: '上传中…' })).toBeVisible()
  await expect(page.getByTestId('photo-preview').getByAltText('证件照')).toBeVisible()
  await expect(page.getByRole('button', { name: '替换照片' })).toBeVisible()
  await pause(page, 1400)
})