import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { clearRateLimits } from '../../e2e/db'
import { DEMO_PASSWORD, DEMO_USERNAME, RAW_DIR, VIEWPORT } from './constants'

/**
 * 录制期专用的交互工具。
 *
 * 与 e2e/helpers.ts 的分工：那里是「跑断言」，这里是「让观感可读」——
 * 鼠标要真的滑过去、动作之间要留停顿、中间态要被放大到看得清。
 */

/** 固定停顿，给观众看画面的时间。 */
export function pause(page: Page, ms: number) {
  return page.waitForTimeout(ms)
}

// ---------------------------------------------------------------------------
// 录制开关
// ---------------------------------------------------------------------------

/** page → 片段 id，用来在 stop 时知道该报哪个文件。 */
const recording = new Map<Page, string>()

/**
 * 开始录这条片段。
 *
 * 用 page.screencast 显式开关，而不是配置里的 use.video：后者从 context
 * 建好就开始录，准备步骤与开场白屏都会进视频；而且它给每个动作加的
 * 展示高亮会在录制时引入明显延迟（一次 mouse.up 就要几百毫秒）。
 */
export async function startClip(page: Page, clipId: string) {
  await mkdir(RAW_DIR, { recursive: true })
  await page.screencast.start({
    path: resolve(RAW_DIR, `${clipId}.webm`),
    size: VIEWPORT,
  })
  recording.set(page, clipId)
}

/** 停止录制并落盘。没在录的话是空操作，用例中途失败也能靠它保住视频。 */
export async function stopClip(page: Page) {
  const clipId = recording.get(page)
  if (!clipId) return
  recording.delete(page)
  await page.screencast.stop()
  console.log(`[demo] 已录到 ${resolve(RAW_DIR, `${clipId}.webm`)}`)
}

// ---------------------------------------------------------------------------
// 鼠标
// ---------------------------------------------------------------------------

/**
 * 自绘鼠标光标层。
 *
 * Playwright 录的是页面像素，本来没有系统光标，所以自己画一层：
 * 监听真实 mousemove / mousedown 更新位置与点击涟漪。
 * 不用 screencast.showActions 的内建光标，是因为它按「动作点」动画，
 * 拖拽排序用裸 mouse 事件驱动时不会跟随。
 *
 * 整层 pointer-events: none，否则会吃掉点击。函数体里不能引用外部变量
 * （addInitScript 是序列化后注入的），所以只能自包含。
 */
function cursorOverlay() {
  const marker = window as unknown as { __demoCursorInstalled?: boolean }
  if (marker.__demoCursorInstalled) return
  marker.__demoCursorInstalled = true

  const host = document.createElement('div')
  host.id = '__demo-cursor-layer'
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;pointer-events:none;overflow:hidden;contain:strict'

  const arrow = document.createElement('div')
  // 位移用 CSS 过渡补间：鼠标步数就能压到很少，观感依然顺滑
  arrow.style.cssText =
    'position:absolute;left:0;top:0;width:22px;height:30px;opacity:0;pointer-events:none;will-change:transform;transition:transform 130ms linear,opacity 150ms linear'
  // 箭头尖端画在元素 (0,0)，这样 translate 到鼠标坐标就是「尖端点在这里」
  arrow.innerHTML =
    '<svg width="22" height="30" viewBox="0 0 15 21"><path d="M0 0 L0 17 L4.6 13.2 L7.4 19 L10 17.8 L7.2 12 L13 12 Z" fill="#111827" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round"/></svg>'

  const ring = document.createElement('div')
  ring.style.cssText =
    'position:absolute;left:0;top:0;width:10px;height:10px;margin:-5px 0 0 -5px;border:3px solid rgba(37,99,235,.9);border-radius:50%;opacity:0;pointer-events:none'

  const style = document.createElement('style')
  // 用 width/height/margin 做动画而不是 transform：transform 已经被用来定位了
  style.textContent =
    '@keyframes demo-ripple{from{width:10px;height:10px;margin:-5px 0 0 -5px;opacity:.9}to{width:46px;height:46px;margin:-23px 0 0 -23px;opacity:0}}'

  host.append(style, arrow, ring)
  // addInitScript 在 document-start 就跑了，那时 document.body 还不存在，
  // 直接挂会静默失败（整层光标就没了），必须等 DOM 建好
  const attach = () => document.body?.appendChild(host)
  if (document.body) attach()
  else document.addEventListener('DOMContentLoaded', attach, { once: true })

  const place = (x: number, y: number) => {
    arrow.style.opacity = '1'
    arrow.style.transform = `translate3d(${x}px,${y}px,0)`
  }

  window.addEventListener('mousemove', (e) => place(e.clientX, e.clientY), {
    capture: true,
    passive: true,
  })

  window.addEventListener(
    'mousedown',
    (e) => {
      place(e.clientX, e.clientY)
      ring.style.left = `${e.clientX}px`
      ring.style.top = `${e.clientY}px`
      // 重启动画：先置 none 再强制读一次 offsetWidth
      ring.style.animation = 'none'
      void ring.offsetWidth
      ring.style.animation = 'demo-ripple 420ms ease-out'
    },
    { capture: true, passive: true }
  )
}

/**
 * 每条片段的起手式：清限流计数 + 装上自绘光标层。
 *
 * 不清限流计数的话，反复重录自己就会撞 429（导入尤其只有 2 次/分钟）。
 */
export async function prepareClip(context: BrowserContext) {
  await clearRateLimits()
  await context.addInitScript(cursorOverlay)
}

/**
 * 平滑滚动到元素。
 *
 * 编辑页很长，必须滚动；但瞬时跳转在动图里看着很晕，所以走 behavior: 'smooth'。
 */
export async function scrollTo(page: Page, target: Locator, afterMs = 550) {
  await target.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  await pause(page, afterMs)
}

/** 平滑滚回页面顶部（导入覆盖、恢复版本之后要展示表单开头）。 */
export async function scrollToTop(page: Page, afterMs = 800) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  await pause(page, afterMs)
}

/** 把光标滑到元素中心并停顿，让观众看清要操作哪里。返回元素位置。 */
export async function moveTo(page: Page, target: Locator, settleMs = 220) {
  const viewport = page.viewportSize() ?? { width: 0, height: 0 }
  let box = await target.boundingBox()

  // 不在视口内就先平滑滚过去：mouse.move 用的是视口坐标，
  // 滚都没滚就直接移过去，点不到东西。
  const inView = box && box.y >= 0 && box.y + box.height <= viewport.height
  if (!inView) {
    await scrollTo(page, target)
    box = await target.boundingBox()
  }
  if (!box) throw new Error('目标不可见，拿不到 boundingBox')

  // 步数刻意压得少：每步都是一次 CDP 往返，20 步要近一秒，
  // 而位移有 CSS 过渡补间，6 步看起来一样顺。
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 })
  await pause(page, settleMs)
  return box
}

/**
 * 滑过去 → 停顿 → 点击。
 *
 * 演示里所有点击都必须走这里：直接 locator.click() 只派发一次跳跃式的
 * mousemove，自绘光标会瞬移而不是滑过去。
 */
export async function moveAndClick(page: Page, target: Locator, afterMs = 450) {
  await moveTo(page, target)
  await page.mouse.down()
  await page.mouse.up()
  await pause(page, afterMs)
}

/** 先清空再逐字输入，制造「在打字」的观感（只用于短字段）。 */
export async function typeSlowly(
  page: Page,
  target: Locator,
  text: string,
  delay = 30,
  afterMs = 300
) {
  await moveAndClick(page, target, 150)
  await target.fill('')
  await target.pressSequentially(text, { delay })
  await pause(page, afterMs)
}

/**
 * 拖拽排序：把 from 手柄拖到 to 手柄的位置。
 *
 * 必须用裸鼠标事件（dnd-kit 认这个），所以这里不走 moveAndClick。
 * 拖到底后先停一下再松手，否则动图里看不到「拖着一条在移动」的过程。
 */
export async function dragHandleOnto(page: Page, from: Locator, to: Locator) {
  const start = await moveTo(page, from)
  await page.mouse.down()
  const target = await to.boundingBox()
  if (!target) throw new Error('拖拽目标不可见')
  await page.mouse.move(start.x + start.width / 2, target.y + target.height / 2, { steps: 10 })
  await pause(page, 250)
  await page.mouse.up()
  await pause(page, 700)
}

/**
 * 只延迟、不改语义的路由挂钩，用来放大一闪而过的中间态。
 *
 * 草稿保存的 debounce 是 1s、但响应本身很快，「保存中…」在动图里根本录不到；
 * 照片的压缩阶段更是完全没有 UI 提示。延迟的是响应，业务数据照常真实落库。
 */
export async function slowDown(page: Page, urlPattern: string, delayMs: number) {
  await page.route(urlPattern, async (route) => {
    await new Promise((r) => setTimeout(r, delayMs))
    await route.continue()
  })
}

// ---------------------------------------------------------------------------
// 页面导航
// ---------------------------------------------------------------------------

/** 演示用的登录操作：填用户名密码并提交。调用前需已打开 /login。 */
export async function loginDemo(page: Page) {
  await pause(page, 500)
  await typeSlowly(page, page.getByLabel('用户名'), DEMO_USERNAME)
  // 密码不逐字敲：既省时间，公开的演示动图里也不该一个字符一个字符地暴露它
  await moveAndClick(page, page.getByLabel('密码'), 200)
  await page.getByLabel('密码').fill(DEMO_PASSWORD)
  await pause(page, 400)
  await moveAndClick(page, page.getByRole('button', { name: '登录' }), 1200)
  await expect(page).toHaveURL('/resumes')
}

/**
 * 取 demo 账号的第一份简历 id。
 *
 * 免登录片段（2/3/4）不经过列表页，靠它直接落到编辑页。
 * page.request 复用 context 的 cookie，storageState 里的会话对它是有效的。
 */
export async function currentResumeId(page: Page) {
  const res = await page.request.get('/api/resumes')
  if (!res.ok()) throw new Error(`获取简历列表失败：${res.status()}`)
  const list = (await res.json()) as { id: string }[]
  const first = list[0]
  if (!first) throw new Error('demo 账号下没有简历，先跑 bun run demo:seed')
  return first.id
}

/** 免登录片段的开场：直接落到编辑页，视频第一帧就是页面加载而不是空屏。 */
export async function openEditDirectly(page: Page) {
  const resumeId = await currentResumeId(page)
  await page.goto(`/resumes/${resumeId}/edit`)
  await expect(page.getByRole('button', { name: '存档', exact: true })).toBeVisible()
  await pause(page, 500)
  return resumeId
}

/**
 * 记下墙钟时间点，供 convert.ts 裁掉片段 3 的空等。
 *
 * 直接按墙钟切会与视频时间轴差几百毫秒，但这里切掉的是几十秒的等待，
 * 误差不可见。
 */
export async function writeMarks(clipId: string, marks: Record<string, number>) {
  await mkdir(RAW_DIR, { recursive: true })
  await writeFile(resolve(RAW_DIR, `${clipId}.marks.json`), JSON.stringify(marks, null, 2))
}