# 演示动图录制方案

> 约定摘要、踩坑清单与日常命令另有一份精简版，在 `CLAUDE.md` 的「演示动图录制（demo/）」一节。改这块时两处要一起更新。

## Context

需要一份能对外展示的项目演示材料：把简历应用的关键功能片段录成动图（GIF）与视频（MP4），用于演示与文档内嵌。

项目已有完整的 Playwright e2e 套件（60 个用例覆盖全部功能），因此不走人工屏幕录制，而是**用 Playwright 脚本驱动真实浏览器 + 真实后端，自动录制**：可反复重录、格式统一、改动后能一键重跑。

四个片段：核心编辑流、草稿自动保存 + 照片上传、导入简历（真实大模型）、版本存档/恢复 + 导出。

约束：录制用**新建的 `demo` 账号**（不能是 `e2e-tester`）；生成物**全部不入库**。

## 方案总览

一条命令跑完：建账号与基线数据 → 逐片段录制 → 转码成 GIF/MP4。

```bash
bun run demo:all      # = demo:seed && demo 录制 && demo:convert
```

录出来的原始视频是 `.webm`，再转成两套产物：GIF（README / 文档内嵌，gifski 编码）与 MP4（正式演示，ffmpeg 编码）。

## 需要先装的一次性依赖

```bash
bunx playwright install ffmpeg   # 录视频必需，Playwright 自带一份精简 ffmpeg（落到 ffmpeg-1011/）
brew install ffmpeg gifski       # 转码流水线用；gifski 只走 brew
```

注意：Playwright 自带的那份 ffmpeg 是给 screencast 编 vp8 用的精简构建，**缺 libx264，不能拿它转 MP4**，所以仍需单独的 brew ffmpeg。`brew install ffmpeg` 首次安装依赖较多，会慢。

## 文件布局

```
demo/
  playwright.config.ts        # 独立配置，与 e2e 完全隔离
  assets/
    demo-resume.ts            # 完整中文示例简历（ResumeData）+ 预置的历史版本快照
    import-sample.txt         # 走真实大模型用的简历纯文本（≥20 字）
    photo.jpg                 # 可选：自备的真实证件照，存在则优先使用
  scripts/
    constants.ts              # 账号、视口、路径常量
    photo.ts                  # 证件照素材：自备优先，否则 canvas 画占位图
    demo-utils.ts             # 录制开关 / 光标注入 / 鼠标 / 节奏 / 导航
    fixtures.ts               # 在基础 test 上加一层：失败时也停录制
    seed-demo.ts              # globalSetup：建 demo 账号 + 基线数据 + storageState
    seed-cli.ts               # `bun run demo:seed` 的入口
    convert.ts                # webm → GIF / MP4
    01-editing.spec.ts
    02-autosave-photo.spec.ts
    03-import.spec.ts
    04-version-export.spec.ts
  output/                     # gitignore；raw/ 原始 webm、clips/ 成品、downloads/ 导出产物
  .auth/                      # gitignore；storageState
```

`demo/playwright.config.ts` 要点：

- `testDir: './scripts'` —— 根配置是 `'./e2e'`，所以 `bun run test:e2e` 天然看不到演示脚本，**根配置不需要改动**。
- `workers: 1`、`retries: 0`（重试会叠加多份视频、污染命名）、`timeout: 300_000`。
- `globalSetup: './scripts/seed-demo.ts'`。
- `use`：`baseURL`、`viewport: 1200×800`、`deviceScaleFactor: 1`、`storageState`（绝对路径，避免依赖 cwd）。
- **不配 `use.video`**，录制由各条 spec 用 `page.screencast` 显式开关（原因见下）。
- `projects[0].use` 里 **`viewport` 必须写在 `...devices['Desktop Chrome']` 之后**：它自带 `1280×720`，会覆盖前面的配置，与录制的 `size` 对不上时画面会被缩放并在底部留一条灰边。
- **webServer 自己起一套前后端**：`VITE_PORT=5300` / `API_PORT=3200`、`reuseExistingServer: false`，并在 `env` 里注入 `SQLITE_PATH=demo/.db/demo.sqlite`。与 dev（5173 + 3000）、e2e（5200 + 3100）都错开，录制时不必停掉手上的 dev；反过来，**复用已在跑的 dev 就等于连回主库**，而录制会反复删改数据，绝不能这么做。

`package.json` 新增脚本（全部从仓库根执行：`scripts/constants.ts` 用 `process.cwd()` 定位目录，并把库文件钉在 `demo/.db/demo.sqlite`）：

```json
"demo": "playwright test --config demo/playwright.config.ts",
"demo:seed": "bun demo/scripts/seed-cli.ts",
"demo:convert": "bun demo/scripts/convert.ts",
"demo:all": "bun run demo:seed && bun run demo && bun run demo:convert"
```

`.gitignore` 追加 `demo/output/`、`demo/.auth/`、`demo/.db/`（录制专用的库文件）。

## 关键实现点

### 1. 用 Test runner + `page.screencast`，不用 `use.video`

Test runner 下「一个 test = 一个 context」，`webServer` 复用、`--grep` 只重录一条、失败退出码都是白送的。手写 `chromium.launch()` 得自己管 context 与文件命名，没有收益。

但**录制本身走 `page.screencast`，不配 `use.video`**。实测下来 `use.video` 有两个硬伤：

1. 它从 context 建好就开始录，准备步骤（登录、建数据、`goto`）与开场白屏都会进视频；
2. 它给每个动作加的展示高亮会在录制时引入明显延迟 —— 单是 `mouse.up` 就要 600ms 左右，第一版片段 1 录出来 **62 秒**；换成 `screencast` 后同样内容降到 **18 秒**。

`screencast` 还能自己指定输出路径，于是 `demo/output/raw/<clipId>.webm` 天然对号入座，不需要收尾时再拷贝改名。

配套：

- `startClip(page, clipId)` 在「准备做完、演示内容开始」的位置调用（用 `page.screencast.start({ path, size })`）；
- `stopClip(page)` 由 `demo/scripts/fixtures.ts` 的 auto fixture 在用例收尾时兜底调用，中途失败也能保住视频；内部用 `Map<Page, clipId>` 判断是否在录，没在录就是空操作。

### 2. 光标：自注入一层，不用内建光标

Playwright 录的是页面像素，本来没有系统光标。`screencast.showActions` 有内建光标，但它按「动作点」动画，而拖拽排序必须用裸 `page.mouse.move/down/up` 驱动 dnd-kit（见 `e2e/edit-form.spec.ts` 的拖拽用例），裸鼠标事件不会让内建光标跟随，画面里光标会僵在原地。

所以用 `context.addInitScript()` 注入一个自绘光标层：

- 固定定位的 `div`（`position: fixed; inset: 0; pointer-events: none; z-index: 2147483647`），内含内联 SVG 箭头 + 一个点击涟漪圆环，监听 `mousemove` / `mousedown`（`capture: true, passive: true`）更新位置。
- `pointer-events: none` 必须同时落在容器与子元素上，否则会吃掉点击。
- **挂载必须等 `DOMContentLoaded`**：`addInitScript` 在 document-start 执行，那时 `document.body` 还不存在，直接 `appendChild` 会静默失败，整层光标就没了。
- 箭头位移用 CSS `transition: transform 130ms linear` 补间，因此鼠标步数可以压得很少（见下）。
- 只在演示 context 上挂（e2e 从不 import 这个文件），e2e 完全不受影响。

配套统一用 `moveAndClick(page, locator)`：先 `boundingBox()`，不在视口内就先平滑滚过去，再 `page.mouse.move(cx, cy, { steps: 6 })`，停顿，再 `down/up`。**所有点击都要走这个 helper**，否则自绘光标不会动。

拖拽场景用 `dragHandleOnto(page, from, to)`，内部是裸鼠标事件，不走 `moveAndClick`。

### 3. 节奏控制

不用全局 `slowMo`：它会把 `waitForResponse` 一起拖长，视频里全是空转。改成**动作后显式停顿**：

- `moveTo` 的 settle 220ms，`moveAndClick` 的 after 450ms（关键结果另传更大的值）；
- 平滑滚动（`scrollIntoView({ behavior: 'smooth' })`）后停 550ms，滚回顶部停 800ms；
- 打字只用于短字段：`pressSequentially(text, { delay: 30 })`，长文本一律 `fill()` + 停顿。

两个额外发现，直接影响节奏参数：

- **`page.mouse.move` 的每一步都是一次 CDP 往返，约 46ms/步**，20 步要近一秒。所以步数压到 6，靠 CSS 过渡补间保持顺滑。
- **`pressSequentially` 每个键约 117ms**（配置的 `delay` 之外还有固定开销），所以打字字段要短，长文本别用。

一闪而过的中间态用**只延迟、不改语义**的 `page.route` 放大，业务数据照常真实落库：

- `**/api/resumes/*/draft` 延迟 700ms → `data-testid="save-status"` 的「保存中…」稳定可见（debounce 是 1000ms，响应本身很快，不延迟根本录不到）。
- `**/api/resumes/*/photo` 延迟 900ms → 按钮「上传中…」可见（前端压缩阶段本身没有任何 UI 提示）。

### 4. 四个片段的具体编排

| clip | 内容 | 起始状态 |
| --- | --- | --- |
| `01-editing` | 登录（用户名逐字输入、密码直接填）→ 列表页「我的简历」→ 打开简历 → 改求职意向 → 「添加教育经历」→ 拖拽排序教育经历 → 工作经历要点删一条再添一条，看 `1./2./3.` 编号重排 | 未登录，`test.use({ storageState: { cookies: [], origins: [] } })` |
| `02-autosave-photo` | 改电话 → 顶部「保存中…」→「已保存」（靠路由延迟放大）→ 上传证件照（`data-testid="photo-input"` 走 `setInputFiles`，绕过系统弹窗）→ `photo-preview` 出现照片、按钮变「替换照片」 | 已登录，直接进编辑页 |
| `03-import` | 「导入简历」→ 粘贴 `assets/import-sample.txt` → 「开始解析」→（真实大模型，等待段后期切掉）→ 「确认导入内容」预览摘要 → 「确认覆盖」→ toast + 表单整体被重写 | 已登录，基线简历有内容，好体现「覆盖」 |
| `04-version-export` | 「存档」→ 填备注 → 「确认存档」→ 切到「已归档的简历版本」→ 徽标变「已存档」→ 「恢复」预置的旧快照 → 二次确认「恢复到这个版本？」→ 整页跳回编辑页且内容被覆盖 → 依次点「导出 Word」「导出 PDF」 | 已登录，基线已预置 1 条历史版本，列表不为空 |

片段 2/3/4 通过 `storageState` 免登录启动（session 存在数据库里，cookie 可跨 context 复用），`startClip` 放在 `page.goto` 之后，视频第一帧就是加载好的编辑页。片段 1 则先 `goto('/login')` 再 `startClip`，避免开场是 about:blank 的白屏。

clips 按文件名顺序串行跑，状态是递进的（片段 1 编辑后的内容会带到片段 2/3/4），所以**单独重录某条前必须先 `bun run demo:seed`**。

### 5. 片段 3 的等待段裁剪

真实模型实测约 30 秒。这条 spec 单独 `test.setTimeout(300_000)`，并且**断言等待要单独放宽**：`toBeVisible({ timeout: 120_000 })` —— 配置里 `expect.timeout` 是 15s，按默认值等会误判失败。

用 `Date.now()` 记录「点解析」与「结果返回」相对**开录时刻**的毫秒数，写到 `demo/output/raw/03-import.marks.json`（`{ waitStartMs, waitMs }`）。`convert.ts` 据此把等待段首尾各留 2s、中间切掉 —— 「解析中，预计 10~60 秒…」本身是有信息量的，全删反而突兀。

因为没有 `use.video` 的时间轴偏移，marks 与视频时间轴基本对齐（误差来自 `start()` 到 `Date.now()` 的几十毫秒），对切掉 30 秒的间隔来说不可见。实测 35s 的片段裁到 13.6s。

失败不自动重试（重录一遍等于再花一次模型调用），直接非零退出并提示 `bun run demo -- --grep 03`。

限流：导入按用户 **2 次/分钟**。每片段开头调用 `e2e/db.ts` 的 `clearRateLimits()`（清的是计数表，对 demo 账号无害）；重录间隔不足 60s 就等一会再跑。

### 6. 导出片段的已知局限

导出成功后是浏览器 blob 下载、**页面内没有任何 toast**，而 Playwright 录的是页面像素、录不到浏览器下载栏。所以这一段能录到的只有「点按钮 → 按钮变『导出中…』→ 恢复」。

处理：脚本用 `waitForEvent('download')` + `download.saveAs()` 把产物落到 `demo/output/downloads/` 保证确实导出成功，画面就停在按钮上。**不在页面里伪造任何提示 UI**。可选加分项：用 `qlmanage` 生成导出 PDF 首页缩略图，再用 ffmpeg 在片尾叠加 2.5s 静帧——这属于后期剪辑手法，不是伪造应用行为。

### 7. demo 账号与基线数据（`seed-demo.ts`）

- **库文件与端口隔离**：`scripts/constants.ts` 把 `process.env.SQLITE_PATH` **覆盖**为 `demo/.db/demo.sqlite`（覆盖而不是兜底，免得 shell 里正好设过就落到你自己的库上），并导出 `DEMO_CLIENT_PORT` / `DEMO_API_PORT`。它同时被 playwright.config 与各脚本引用，所以 webServer 子进程也继承到同一个路径。
- **连接用 `node:sqlite`，不是 `bun:sqlite`**：这个脚本有两条执行路径 —— `bun run demo:seed` 跑在 Bun，被 Playwright 的 globalSetup 加载时跑在 **Node**（Playwright 不支持 Bun 运行时）。`bun:sqlite` 在 Node 下 import 不了，而 `node:sqlite` 两边都可用，所以直接用它 + 原生 SQL 读写同一个库文件，表名 / 列名对齐 `server/src/schema.ts`。`e2e/db.ts` 同理。
- **先补表结构**：`ensureSchema()` 借 `execFileSync('bun', ['run', 'db:migrate'])` 跑一次服务端迁移（cwd 为 `server/`、带上 `SQLITE_PATH`）。录制时 webServer 起服务已经建过库，这一步是幂等的；单独跑 `bun run demo:seed` 时靠它建表。
- **密码哈希借 bun 子进程算**：Node 那条路径上没有 `Bun` 全局，所以统一用 `execFileSync('bun', ['-e', ...])` 来算，与 `e2e/db.ts` 的 `hashPassword` 做法相同。
- **安全护栏**：用户名硬编码常量 `demo`，不读 argv；开头断言用户名不在 `['e2e-tester', 'admin']` 里；只操作该用户的数据。
- **幂等**：按用户名查到就改密码、查不到就插入（每次重置密码，方便录屏）→ 删掉该账号旧简历 → 建一份「张伟的简历（前端工程师）」写入 `assets/demo-resume.ts` → 建 `photo` 行 → 预置 1 条带备注「投递前端岗」的 `resumeVersion`，让片段 4 的列表非空。JSON 列（`data` / `snapshot`）要自己 `JSON.stringify`，日期列存毫秒数。
- **照片只挂在预置版本上，当前草稿保持「未上传」**：片段 2 才有「选择照片 → 预览出现」这个过程可录。
- **预置快照刻意是一份更早的修订版**（求职意向不同、教育/技能/项目各少一条）：片段 4 恢复之后表单内容明显变样，看得见覆盖确实发生；同时当前草稿与它不一致，列表首条显示「未存档」，点存档后徽标变「已存档」，整段有个完整的弧线。
- **注意**：重建简历会级联删除该账号下的 photos/versions，这与产品「照片只增不删」的约定冲突，但仅限 `demo` 账号，脚本注释里写明。
- 同时输出 `demo/.auth/state.json`（用 `request.newContext()` 走真实登录接口 `/api/auth/login` 后 `storageState()`），供片段 2/3/4 免登录复用。服务没起时跳过并提示，录制时 Playwright 的 `webServer` 已就绪，globalSetup 会补上。
- **`seed-cli.ts` 单独存在**是因为 globalSetup 与 CLI 共用 `seed-demo.ts`，而 Playwright 把 globalSetup 当 CJS 读，那里不能用 `import.meta.main` 判直接执行。

### 8. 转换流水线（`convert.ts`）

`Bun.spawn` 依次调 ffmpeg / gifski，产物落 `demo/output/clips/`。

MP4（无音轨、faststart 便于网页嵌入）：

```bash
ffmpeg -y -v error -i demo/output/raw/01-editing.webm \
  -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -an -movflags +faststart \
  demo/output/clips/01-editing.mp4
```

GIF（只做 fps/scale，管道直接喂 gifski，不落盘中间 PNG）：

```bash
ffmpeg -v error -i demo/output/raw/01-editing.webm \
  -vf "fps=12,scale=900:-1:flags=lanczos" -f yuv4mpegpipe - \
  | gifski --fps 12 --width 900 --quality 85 --motion-quality 70 --lossy-quality 70 \
      -o demo/output/clips/01-editing.gif -
```

为什么用 gifski 而不是 ffmpeg 的 `palettegen/paletteuse`：palettegen 是全局 256 色，证件照会出明显色带、抗锯齿文字发灰；gifski 用跨帧调色板 + 时域抖动，且只编码变化区域，对这种大面积静止的 UI 录屏收益极大，不需要手工加 `mpdecimate`。

体积控制：`--width` 是第一杠杆；仍偏大就压 `--motion-quality 60`。单条 GIF 超过 2.5MB 时脚本会打印告警。

实测产物：

| clip | 时长 | GIF | MP4 |
| --- | --- | --- | --- |
| 01-editing | 17.9s | 1.05MB | 0.99MB |
| 02-autosave-photo | 8.0s | 0.12MB | 0.10MB |
| 03-import | 13.6s（原始 35s，裁掉空等） | 0.51MB | 0.43MB |
| 04-version-export | 15.7s | 0.46MB | 0.36MB |

## 验证

1. `bun run demo:seed` —— 打印 demo 账号与简历 id，确认没有碰到其他账号；检查 `demo/.auth/state.json` 已生成。
2. `bun run demo -- --grep 01` —— 只录一条，检查 `demo/output/raw/01-editing.webm` 存在。
3. `bun run demo:convert` —— 产出 `demo/output/clips/*.gif` 与 `*.mp4`，看体积是否在 2.5MB 内。
4. `bun run test:e2e -- --list` —— 确认列出的用例里**没有**任何 demo 脚本，隔离成立；再跑一次 `bun run test:e2e` 确认 e2e 未被破坏。
5. 人眼看 GIF（用 `ffmpeg -ss <t> -i x.gif -frames:v 1 f.png` 抽帧）：光标可见且会移动、拖拽排序能看清、草稿「保存中…→已保存」能看清、导入的等待段被切掉且衔接自然、片段 4 的整页跳转后没有光标僵在左上角、画面底部没有灰边。
6. 逐条重录：`bun run demo:seed && bun run demo -- --grep 03 && bun run demo:convert`。

## 风险与已经踩过的坑

| 风险 | 规避 |
| --- | --- |
| 没装 Playwright ffmpeg → 录制直接报错 | 录制前先 `bunx playwright install ffmpeg`；`seed-demo.ts` 开头检测 `~/Library/Caches/ms-playwright/ffmpeg-*` 是否存在，缺失就打印命令并退出 |
| **画面底部一条灰边** | `devices['Desktop Chrome']` 自带 `1280×720` viewport 会覆盖配置，必须把 `viewport` 写在 devices 展开之后，且与 `screencast.start` 的 `size` 一致 |
| **自绘光标整层不出现** | `addInitScript` 在 document-start 跑，`document.body` 还不存在，必须等 `DOMContentLoaded` 再 append |
| **`use.video` 让录制时长翻几倍** | 它给每个动作加高亮延迟（`mouse.up` 约 600ms）。改用 `page.screencast` 显式开关 |
| **真实模型的断言 15s 超时误判** | 解析那一步单独 `toBeVisible({ timeout: 120_000 })`，不要吃 `expect.timeout` 的默认值 |
| globalSetup 里没有 `Bun` 全局 | 密码哈希借 `bun -e` 子进程；`import.meta.main` 在 CJS 下会语法报错，CLI 入口另开 `seed-cli.ts` |
| Playwright 跑在 Node 上，脚本 import 不到 `bun:sqlite` | globalSetup 与 `e2e/db.ts` 一律用 Node 内置的 `node:sqlite`（Bun 与 Node 下都能用） |
| 录制跑到你自己的库上 | `constants.ts` 强制覆盖 `SQLITE_PATH` 到 `demo/.db/demo.sqlite`；webServer 注入同一路径且 `reuseExistingServer: false` |
| 片段 4 的「恢复」是 `window.location.assign` 整页跳转 | 自绘光标靠 `addInitScript` 在导航后重建；跳转后第一个动作必须走 `moveTo`/`moveAndClick`，否则光标要等第一次鼠标移动才出现 |
| 撞限流 429 | 每片段开头 `clearRateLimits()`；导入重录间隔 ≥65s |
| macOS 屏幕录制权限 | **不需要**：录的是 CDP 页面像素，不是屏幕采集；headless 录制，帧率更稳 |
| 真实大模型不稳定 / 慢 / 花钱 | 单条 spec 放宽到 5 分钟超时；失败只提示重录不自动重试；等待段靠 marks.json 裁掉 |
| demo 脚本误删真实数据 | 用户名硬编码 + 黑名单断言；demo 配置与 e2e 配置互不可见 |
| 片段间状态互相污染 | clip 顺序固定、`workers: 1`；单独重录某条前必须先 `bun run demo:seed` |