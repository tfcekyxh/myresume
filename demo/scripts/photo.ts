import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { PROVIDED_PHOTO_PATH } from './constants'

/**
 * 在浏览器里画一张占位证件照，返回 data URL。
 *
 * 仓库里没有可用的证件照素材，用 canvas 画一张「蓝底 + 头肩剪影」，
 * 至少看得出是张证件照。函数体里不能引用外部变量（page.evaluate 是序列化后注入的）。
 */
export function paintDemoPhoto(): string {
  const w = 480
  const h = 640
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#eff6ff')
  bg.addColorStop(1, '#93c5fd')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = '#2563eb'
  // 头
  ctx.beginPath()
  ctx.arc(w / 2, h * 0.33, w * 0.165, 0, Math.PI * 2)
  ctx.fill()
  // 肩
  ctx.beginPath()
  ctx.moveTo(w / 2 - w * 0.3, h)
  ctx.quadraticCurveTo(w / 2, h * 0.52, w / 2 + w * 0.3, h)
  ctx.closePath()
  ctx.fill()

  return canvas.toDataURL('image/jpeg', 0.9)
}

/**
 * 证件照素材：自备的真实照片优先，没有就现场生成一张占位图。
 *
 * seed 脚本（写进预置版本）与片段 2（上传证件照）都用它，
 * 免得同一段 canvas 代码写两遍。
 */
export async function resolvePhotoBuffer(page: Page): Promise<Buffer> {
  if (existsSync(PROVIDED_PHOTO_PATH)) {
    console.log(`[demo] 使用自备证件照 ${PROVIDED_PHOTO_PATH}`)
    return readFile(PROVIDED_PHOTO_PATH)
  }

  const dataUrl = await page.evaluate(paintDemoPhoto)
  return Buffer.from(dataUrl.split(',')[1]!, 'base64')
}