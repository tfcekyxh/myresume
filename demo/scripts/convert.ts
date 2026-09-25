import { existsSync, statSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { CLIPS_DIR, RAW_DIR } from './constants'

/**
 * 把录到的 webm 转成 GIF 与 MP4。
 *
 * GIF 走 ffmpeg 解码 + 管道喂 gifski：gifski 用跨帧调色板，
 * 对这种大面积静止的 UI 录屏体积小、无 256 色色带，
 * 比 ffmpeg 的 palettegen/paletteuse 明显好。
 * MP4 留给 ffmpeg，用 libx264。
 */

/** 片段清单，顺序即转码顺序。 */
const CLIPS = [
  { id: '01-editing', title: '核心编辑流' },
  { id: '02-autosave-photo', title: '草稿自动保存 + 照片上传' },
  { id: '03-import', title: '导入简历（真实大模型）' },
  { id: '04-version-export', title: '存档 / 恢复 + 导出' },
]

const FPS = 12
/** GIF 宽度是第一体积杠杆：1200 → 900 大约省一半。 */
const GIF_WIDTH = 900
/** 单条 GIF 超过这个体积就不适合内嵌到文档里了。 */
const GIF_BUDGET_MB = 2.5
/** 大模型空等那段，首尾各留这么久，中间切掉。 */
const WAIT_KEEP_MS = 2000

type Marks = { waitStartMs: number; waitMs: number }

/** 跑一条命令，非 0 退出就带上 stderr 抛错。 */
async function run(cmd: string[]) {
  const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' })
  const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()])
  if (code !== 0) {
    throw new Error(`${cmd[0]} 失败（退出码 ${code}）：\n${stderr.trim()}`)
  }
}

/** 片段 3 记下的等待时间点，其它片段没有。 */
async function readMarks(clipId: string): Promise<Marks | null> {
  const path = resolve(RAW_DIR, `${clipId}.marks.json`)
  if (!existsSync(path)) return null
  return JSON.parse(await readFile(path, 'utf-8')) as Marks
}

/**
 * 构造 ffmpeg 的滤镜参数。
 *
 * marks 有值时把大模型的空等段切掉，只留首尾各一小段 ——
 * 「解析中，预计 10~60 秒…」本身是有信息量的，全删反而突兀。
 */
function buildFilterArgs(filters: string[], marks: Marks | null): string[] {
  const chain = filters.join(',')
  const plain = chain ? ['-vf', chain] : []

  if (!marks) return plain

  const head = (marks.waitStartMs + WAIT_KEEP_MS) / 1000
  const tail = (marks.waitMs - WAIT_KEEP_MS * 2) / 1000
  // 模型回得很快时没有可切的部分，正常转
  if (tail <= 0) return plain

  const end = head + tail
  const pre = chain || 'null'
  const graph =
    `[0:v]${pre},trim=end=${head.toFixed(3)},setpts=PTS-STARTPTS[a];` +
    `[0:v]${pre},trim=start=${end.toFixed(3)},setpts=PTS-STARTPTS[b];` +
    `[a][b]concat=n=2:v=1[out]`
  return ['-filter_complex', graph, '-map', '[out]']
}

/** ffmpeg 解码并缩放，产物经管道交给 gifski 编码。 */
async function toGif(webm: string, filterArgs: string[], out: string) {
  const ff = Bun.spawn(
    ['ffmpeg', '-v', 'error', '-i', webm, ...filterArgs, '-f', 'yuv4mpegpipe', '-'],
    { stdout: 'pipe', stderr: 'pipe' }
  )
  const gif = Bun.spawn(
    [
      'gifski',
      '--fps',
      String(FPS),
      '--width',
      String(GIF_WIDTH),
      '--quality',
      '85',
      '--motion-quality',
      '70',
      '--lossy-quality',
      '70',
      '-o',
      out,
      '-',
    ],
    { stdin: ff.stdout, stdout: 'pipe', stderr: 'pipe' }
  )

  const [ffCode, gifCode, ffErr, gifErr] = await Promise.all([
    ff.exited,
    gif.exited,
    new Response(ff.stderr).text(),
    new Response(gif.stderr).text(),
  ])
  if (ffCode !== 0) throw new Error(`ffmpeg 失败（退出码 ${ffCode}）：\n${ffErr.trim()}`)
  if (gifCode !== 0) throw new Error(`gifski 失败（退出码 ${gifCode}）：\n${gifErr.trim()}`)
}

function sizeMb(path: string) {
  return statSync(path).size / 1024 / 1024
}

async function convertClip(clip: (typeof CLIPS)[number]) {
  const webm = resolve(RAW_DIR, `${clip.id}.webm`)
  if (!existsSync(webm)) {
    throw new Error(
      `缺少 ${webm}\n先录这条：bun run demo -- --grep ${clip.id.slice(0, 2)}`
    )
  }

  const marks = await readMarks(clip.id)
  const gif = resolve(CLIPS_DIR, `${clip.id}.gif`)
  const mp4 = resolve(CLIPS_DIR, `${clip.id}.mp4`)

  // MP4：交付用，无音轨、faststart 便于网页嵌入
  await run([
    'ffmpeg',
    '-y',
    '-v',
    'error',
    '-i',
    webm,
    ...buildFilterArgs([], marks),
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-an',
    '-movflags',
    '+faststart',
    mp4,
  ])

  await toGif(
    webm,
    buildFilterArgs([`fps=${FPS}`, `scale=${GIF_WIDTH}:-1:flags=lanczos`], marks),
    gif
  )

  const gifMb = sizeMb(gif)
  const over = gifMb > GIF_BUDGET_MB ? `  ⚠️ 超过 ${GIF_BUDGET_MB}MB，可下调 GIF_WIDTH` : ''
  console.log(
    `${clip.id.padEnd(18)} ${clip.title.padEnd(24)} gif ${gifMb.toFixed(2)}MB  mp4 ${sizeMb(mp4).toFixed(2)}MB${over}`
  )
}

async function main() {
  await mkdir(CLIPS_DIR, { recursive: true })
  for (const clip of CLIPS) {
    await convertClip(clip)
  }
  console.log(`\n产物目录：${CLIPS_DIR}`)
}

await main()