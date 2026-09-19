import { expect, test, type Page } from '@playwright/test'
import {
  clearPhoto,
  getCurrentResumeId,
  loginAsDefaultUser,
  resetDraft,
} from './helpers'
import { countResumePhotos, disconnectDb } from './db'

/**
 * 证件照前端压缩与上传，走真实接口。
 *
 * 上传会把照片落库（resumes.photoId），所以每个用例前先把当前照片清掉，
 * 保证都从「未上传」开始。
 */
const PHOTO_PATH = '/photo'

test.beforeEach(async ({ page }) => {
  await loginAsDefaultUser(page)
  await clearPhoto(page)
  await resetDraft(page)
  await page.reload()
})

test.afterAll(async () => {
  await disconnectDb()
})

/** 在页面里用 canvas 生成一张 JPEG，返回完整 data URL。 */
async function makeJpeg(page: Page, width: number, height: number): Promise<string> {
  return page.evaluate(
    ({ w, h }) => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      const gradient = ctx.createLinearGradient(0, 0, w, h)
      gradient.addColorStop(0, '#3366ff')
      gradient.addColorStop(1, '#ff6633')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, w, h)
      return canvas.toDataURL('image/jpeg', 0.9)
    },
    { w: width, h: height }
  )
}

/**
 * 生成一张 2000×2000 的随机噪声 JPEG。
 *
 * 噪声几乎不可压缩，保证原图明显大于压缩阈值，否则证明不了「压缩生效」。
 */
async function makeLargeNoiseJpeg(page: Page): Promise<string> {
  return page.evaluate(() => {
    const size = 2000
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    const image = ctx.createImageData(size, size)
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = Math.random() * 256
      image.data[i + 1] = Math.random() * 256
      image.data[i + 2] = Math.random() * 256
      image.data[i + 3] = 255
    }
    ctx.putImageData(image, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.95)
  })
}

/** 用页面里的 Image 解码，读回真实像素尺寸。 */
async function readImageSize(page: Page, dataUrl: string) {
  return page.evaluate(async (src) => {
    const img = new Image()
    img.src = src
    await img.decode()
    return { width: img.naturalWidth, height: img.naturalHeight }
  }, dataUrl)
}

/** 等一次成功的照片上传响应（须在触发上传前调用）。 */
function waitForUpload(page: Page) {
  return page.waitForResponse(
    (res) =>
      res.request().method() === 'POST' &&
      res.url().includes(PHOTO_PATH) &&
      res.status() === 200
  )
}

/** 用真实接口预置一张照片（构造前置条件，不做断言）。 */
async function uploadPhotoViaApi(page: Page, base64: string) {
  const resumeId = await getCurrentResumeId(page)
  const res = await page.request.post(`/api/resumes/${resumeId}/photo`, {
    data: { data: base64 },
  })
  if (!res.ok()) throw new Error(`预置照片失败：${res.status()}`)
}

test('选大图后上传的是压缩过的证件照尺寸 JPEG', async ({ page }) => {
  await expect(page.getByRole('button', { name: '选择照片' })).toBeVisible()

  const sourceDataUrl = await makeLargeNoiseJpeg(page)
  const sourceBuffer = Buffer.from(sourceDataUrl.split(',')[1], 'base64')
  // 原图必须明显大于压缩上限，否则这条用例证明不了压缩
  expect(sourceBuffer.byteLength).toBeGreaterThan(500 * 1024)

  const responsePromise = waitForUpload(page)
  await page.getByTestId('photo-input').setInputFiles({
    name: 'big.jpg',
    mimeType: 'image/jpeg',
    buffer: sourceBuffer,
  })

  const uploaded = (await responsePromise).request().postDataJSON() as { data: string }
  // 真实接口上传成功后按钮文案变化
  await expect(page.getByRole('button', { name: '替换照片' })).toBeVisible()

  const decoded = Buffer.from(uploaded.data, 'base64')
  // JPEG 魔数 FF D8，确认压出来的是 JPEG
  expect(decoded[0]).toBe(0xff)
  expect(decoded[1]).toBe(0xd8)
  // 压缩生效：远小于原图，量级在 100KB 以内
  expect(decoded.byteLength).toBeLessThan(200 * 1024)

  const size = await readImageSize(page, `data:image/jpeg;base64,${uploaded.data}`)
  expect(size).toEqual({ width: 234, height: 260 })
})

test('上传成功后预览出现照片且按钮变为替换照片', async ({ page }) => {
  await expect(page.getByTestId('photo-preview').getByText('未上传')).toBeVisible()

  const dataUrl = await makeJpeg(page, 600, 400)
  const buffer = Buffer.from(dataUrl.split(',')[1], 'base64')

  const responsePromise = waitForUpload(page)
  await page.getByTestId('photo-input').setInputFiles({
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    buffer,
  })
  await responsePromise

  await expect(page.getByTestId('photo-preview').getByAltText('证件照')).toBeVisible()
  await expect(page.getByRole('button', { name: '替换照片' })).toBeVisible()
})

test('已有照片时打开编辑页会加载并显示照片', async ({ page }) => {
  const dataUrl = await makeJpeg(page, 400, 300)
  const base64 = dataUrl.split(',')[1]
  await uploadPhotoViaApi(page, base64)

  await page.reload()

  await expect(page.getByTestId('photo-preview').getByAltText('证件照')).toHaveAttribute(
    'src',
    `data:image/jpeg;base64,${base64}`
  )
  await expect(page.getByRole('button', { name: '替换照片' })).toBeVisible()
})

test('已有照片时再选一张会再次上传并更新预览', async ({ page }) => {
  const existing = await makeJpeg(page, 400, 300)
  await uploadPhotoViaApi(page, existing.split(',')[1])
  await page.reload()
  await expect(page.getByTestId('photo-preview').getByAltText('证件照')).toBeVisible()

  const newDataUrl = await makeJpeg(page, 300, 300)
  const newBuffer = Buffer.from(newDataUrl.split(',')[1], 'base64')

  const responsePromise = waitForUpload(page)
  await page.getByTestId('photo-input').setInputFiles({
    name: 'new.jpg',
    mimeType: 'image/jpeg',
    buffer: newBuffer,
  })
  const uploaded = (await responsePromise).request().postDataJSON() as { data: string }

  // 预览更新为刚上传的那张（缓存里写的是压缩后的 base64）
  await expect(page.getByTestId('photo-preview').getByAltText('证件照')).toHaveAttribute(
    'src',
    `data:image/jpeg;base64,${uploaded.data}`
  )
})

test('重复上传同一张照片会复用同一张且不新增记录', async ({ page }) => {
  const resumeId = await getCurrentResumeId(page)
  const dataUrl = await makeJpeg(page, 600, 400)
  const buffer = Buffer.from(dataUrl.split(',')[1], 'base64')
  const before = await countResumePhotos(resumeId)

  const firstPromise = waitForUpload(page)
  await page.getByTestId('photo-input').setInputFiles({
    name: 'same.jpg',
    mimeType: 'image/jpeg',
    buffer,
  })
  const firstId = ((await (await firstPromise).json()) as { id: string }).id
  const afterFirst = await countResumePhotos(resumeId)
  expect(afterFirst).toBe(before + 1)

  // 同一张图再传一次：前端重新压缩结果一致，后端应复用同一行
  const secondPromise = waitForUpload(page)
  await page.getByTestId('photo-input').setInputFiles({
    name: 'same.jpg',
    mimeType: 'image/jpeg',
    buffer,
  })
  const secondId = ((await (await secondPromise).json()) as { id: string }).id

  expect(secondId).toBe(firstId)
  expect(await countResumePhotos(resumeId)).toBe(afterFirst)
})

test('照片超过 500KB 时显示后端返回的错误', async ({ page }) => {
  // 前端会把图压到 234×260，正常流程到不了 500KB；这里把发往真实接口的
  // 请求体换成超限的 base64，验证后端 400 的错误能被界面正确展示。
  const oversized = 'A'.repeat(700 * 1024)
  await page.route('**/api/resumes/*/photo', (route) =>
    route.request().method() === 'POST'
      ? route.continue({ postData: JSON.stringify({ data: oversized }) })
      : route.continue()
  )

  const dataUrl = await makeJpeg(page, 400, 300)
  const buffer = Buffer.from(dataUrl.split(',')[1], 'base64')

  await page.getByTestId('photo-input').setInputFiles({
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    buffer,
  })

  await expect(page.getByText('照片不能超过 500 KB')).toBeVisible()
  // 上传失败，按钮仍是「选择照片」
  await expect(page.getByRole('button', { name: '选择照片' })).toBeVisible()
})
