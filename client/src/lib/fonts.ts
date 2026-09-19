import { FONT, FONT_CANDIDATES } from '@mymenu/shared'

/**
 * 探测本机装了哪个导出候选字体。
 *
 * docx 由后端生成、Word 渲染，后端不知道用户本机装了哪些字体；
 * 这里在前端用 canvas 测宽法逐个判断，把第一个可用的字体名带回导出请求。
 *
 * 用测宽法而非 document.fonts.check：后者对不存在的字体在部分浏览器会误报 true。
 */
function isInstalled(family: string): boolean {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return false
  // 中英混排，避免纯拉丁文字在字体缺失时宽度恰好相同而误判
  const probe = '汉字Wg8'
  ctx.font = '72px monospace'
  const base = ctx.measureText(probe).width
  ctx.font = `72px "${family}", monospace`
  return ctx.measureText(probe).width !== base
}

let cached: string | null = null

/** 按优先级返回第一个本机安装的字体；都没装则回退默认。结果做模块级缓存。 */
export function detectDocxFont(): string {
  cached ??= FONT_CANDIDATES.find(isInstalled) ?? FONT.body
  return cached
}