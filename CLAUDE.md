# 项目约定

简历 Web 应用：填表 → 自动存草稿 → 手动存版本 → 导出 docx / PDF。

## 文档索引

| 文档 | 用途 |
| --- | --- |
| `project-scope.md` | 需求与行为、简历结构定义 |
| `tech-stack.md` | 技术选型与实现约定、排版参数（样式来源） |
| `impl-plan.md` | 分步实施计划（Step 1~20） |
| `pdf-export-plan.md` | PDF 导出实施方案（Step 17~20 详情） |
| `demo-recording-plan.md` | 演示动图录制方案与排障记录 |

改需求或新增实现约定前，先对应更新这几份文档。

## 技术栈

- 运行时 / 包管理：Bun 1.4.2
- 前端：React 19 + TypeScript + Vite 8，Tailwind CSS，shadcn/ui（源码拷贝式）
- 服务端：Express 5 + zod（DTO 校验）
- ORM：Drizzle ORM 0.45（`drizzle-orm/bun-sqlite`，没有代码生成步骤）
- 数据库：SQLite（单文件，库文件即全部数据；迁移产物在 `server/drizzle/`，服务启动时自动执行）
- 鉴权：express-session + 自建 SQLite session store（`server/src/session.ts`）
- 密码哈希：`Bun.password`（内置 argon2id）
- 导出：`docx` 库代码构建 docx；PDF 由服务端用 PDFKit 直接生成并内嵌字体（见 `pdf-export-plan.md`）
- 工程：Bun workspaces：`client/` + `server/` + `shared/`

## 目录结构

```
client/         React 前端
  bunfig.toml    组件测试的 preload 配置（注册 happy-dom）
  src/test/      setup.ts：把 happy-dom 的 window/document 注册成全局
  src/**/*.test.tsx  组件测试与源码同目录
server/          Express 后端 + Drizzle
  .env          库文件路径、SESSION_SECRET、管理员与大模型配置（不入库）
  assets/fonts/ PDF 导出用的思源黑体静态字重 + OFL 许可
  src/schema.ts 表结构定义
  drizzle.config.ts + drizzle/  迁移配置与迁移产物（产物入库）
  src/seed.ts   预置登录账号
  data/         SQLite 库文件（不入库）
shared/          前后端共享：zod schema、类型、样式常量
e2e/             Playwright 端到端测试
  env.ts         测试专用的库文件与端口
  .db/           测试专用库文件（不入库）
demo/            功能演示动图的录制脚本（产物不入库）
  .db/           录制专用库文件（不入库）
playwright.config.ts
```

## 常用命令

```bash
bun install              # 工作区安装依赖
bun run dev              # 同时起前后端
bun run db:generate      # 由 schema 生成迁移 SQL（改表后跑，产物要入库）
bun run db:migrate       # 建库 / 补迁移（服务启动时也会自动跑一次）
bun run db:seed          # 预置账号：bun run db:seed -- -u <用户> -p <密码>
bun run db:studio        # 浏览库内容
bun run backup:mail      # 手动发一次备份邮件（与每月定时任务同一条代码路径）
bun run test:component   # 跑前端组件测试（bun test + React Testing Library）
bun run test:e2e         # 跑 Playwright 端到端测试
bun run test:e2e:ui      # 可视化 UI 模式
bun run demo:all         # 建演示账号与基线数据 → 录制四段演示 → 转码 GIF/MP4
bun run demo             # 只录制（globalSetup 会先建基线数据）
bun run demo:convert     # 只转码
bun run demo:seed        # 只重建演示账号与基线数据
```

需在 `server/` 目录下执行 drizzle 命令（Bun 隔离安装，依赖在各 workspace 内；`drizzle.config.ts` 的路径基于 cwd）。日常开发不必手动跑 `db:migrate`——服务启动时会自动补迁移。

## 环境变量

- 只在 `server/.env`，不入库。`.env.example` 提交。
- Bun 运行时自动从 cwd（`server/`）加载 `.env`。
- drizzle-kit 不保证自动加载，由 `drizzle.config.ts` 里的 dotenv 显式读取 `server/.env`。
- `SQLITE_PATH`：库文件路径，留空则用默认值 `server/data/app.sqlite`；部署挂载卷时改到卷内路径。
- `ADMIN_USERNAME`：数据备份的唯一管理员。**留空即无人有权限，`/api/admin/*` 一律 403。**
- `MAIL_API_URL` / `MAIL_API_KEY` / `MAIL_FROM` / `MAIL_TO`：邮件发送通道，每月备份邮件与版本列表的「发送到邮箱」共用。默认走 Resend 的 HTTP 接口；`MAIL_API_KEY` 与 `MAIL_TO` 任一留空都视为未配置，这两处功能一起关闭（不设为启动必需）。Resend 未验证自有域名时 `MAIL_FROM` 只能是 `onboarding@resend.dev`，且只能发给注册邮箱。
- `MAIL_TO` **刻意不给默认值**：真实邮箱只写在 `server/.env` 或部署面板的环境变量里，**源码、文档、`.env.example`、测试里一律不出现真实地址**（仓库会公开、历史还会永久留着）。测试用 `example.com` 的假地址。

## 开发顺序

- **先前端，后后端**：每个 step 先把页面与交互做出来、能在浏览器里看到效果，再做后端接口与数据落库。
- 接口契约以 `shared/` 的 zod schema 为准，前端先按契约调用，后端补齐时保持字段一致。

## 关键实现约定

- **草稿保存**：debounce 1s 整体 `PATCH /api/resumes/:id/draft`；`visibilitychange`（hidden）与 `pagehide` 时用 `fetch(..., { keepalive: true })` 立即补发一次（sendBeacon 只能发 POST，与 PATCH 接口不符）。
- **草稿与版本**：草稿（`resumes.data`）是唯一的工作区，编辑时自动保存覆盖它；版本（`resume_versions.snapshot`）是**只读快照**，只在点「存档」时产生，产生后永不改变。恢复 = 用快照覆盖草稿。版本列表顶部固定显示一条「当前草稿（未存档）」，内容随编辑实时更新，只可查看、不可恢复。照片跟随版本（`resume_versions.photo_id`）。
- **照片**：base64 存独立 `photos` 表，简历与快照只存 `photo_id` 引用；`photos` 只增不删。前端必须压缩后再传。
- **导入简历**：编辑页「导入简历」支持粘贴文本与 `.txt/.md/.docx/.pdf` 文件。文件文字提取只在浏览器本地（`mammoth` / `pdfjs-dist`，扫描版 PDF 不支持、不做 OCR）；结构化解析在服务端 `POST /api/import/parse`，调 OpenAI 兼容大模型（默认智谱 GLM-4-Flash，配置 `LLM_BASE_URL/LLM_API_KEY/LLM_MODEL`，Key 不设为启动必需，未配置时 503），结果宽容归一化后过 `resumeDataSchema`。前端预览摘要 → 二次确认 → `form.reset()` **整体覆盖**，草稿自动保存照常落库；不导入照片。e2e 用 `page.route` mock 解析接口，不打真实模型。
- **简历结构**：只定义一份 zod schema 于 `shared/`，前端表单、后端校验、docx 生成三处复用。
- **编辑页表单**：单层 `useForm<ResumeData>` + `zodResolver(resumeDataSchema)`，用 `FormProvider` 下发，各模块组件通过 `useFormContext` 读写。可多条目模块用 `useFieldArray` + dnd-kit，拖拽结束调 `move()` 而非直接改数组。
- **要点列表**：`points` 是嵌套在条目内的字符串数组，RHF 的路径类型推导不到，改用 `useWatch` + `setValue` 手动维护增删（因此不支持拖拽）。
- **样式**：排版参数集中在 `shared/style-constants.ts`，前端 CSS 与后端 docx、PDF 共同读取，禁止任何一处硬编码。
- **多简历**：`user 1:N resume 1:N resume_version`。一个人可以有多份简历（前端 / 后端 / 全栈），每份各有自己的草稿与版本记录。登录后进 `/resumes` 列表页选一份，再进 `/resumes/:resumeId/edit`、`/versions`；**resume id 从 URL 取**，刷新与分享链接都能落到同一份。接口：`GET/POST /api/resumes`、`GET/PATCH/DELETE /api/resumes/:id`。
- **限流**：计数落 `RateLimit` 表（`server/src/rate-limit.ts`），加一是 Drizzle 的 `onConflictDoUpdate + returning`。单机自部署只有一个进程，落库不是为了多实例共享，而是为了重启不丢当前窗口的计数。登录按 IP（15 分钟 10 次）、注册按 IP（1 小时 2 次）、导入按用户（1 分钟 2 次）、导出按用户（1 分钟 5 次）、发送到邮箱按用户（1 分钟 5 次，key 是 `resume-mail`，与导出各自独立计数）、备份三接口按用户（1 分钟 5 次），另有 `/api/*` 按 IP 每分钟 600 次的宽松兜底。
- **SQLite 三条硬约定**（都在 `server/src/db.ts`，全是实测踩出来的）：开库必须设 `PRAGMA foreign_keys = ON`，否则级联删除静默失效（删简历时照片与版本不跟着删）；原生 `sql` 模板里**不能绑 `Date`**，`bun:sqlite` 不接受它、且比较会静默失效——时间条件一律传毫秒数（类型化 API 传 `Date` 没问题）；`updatedAt` 带 `$onUpdate`，所以「把 `lastArchivedAt` 对齐到 `updatedAt`」必须走原生 SQL，否则草稿永远显示「未存档」。
- **单实例**：SQLite 单写者，不能横向扩多实例，多个进程写同一个文件会直接变成 500。单机自部署正是这套方案的前提，不是缺陷。
- **安全响应头与 CSRF**：helmet 挂在 `server/src/index.ts`；CSRF 在主防线 `SameSite=Lax` 之外再加一层同源 `Origin` 校验（`server/src/csrf.ts`）。开发期 Vite 代理必须开 `xfwd`，否则改写后的 Host 与浏览器 Origin 对不上会被误杀。
- **e2e 与限流**：限流用的是生产级严格阈值，用例开始前要清空计数表——`e2e/db.ts` 的 `clearRateLimits()`（`loginAsDefaultUser` 已内置），否则跑测试自己就会撞 429。

## 导出（docx / PDF 两条路径）

两条路径**并存**，共用同一份版式常量与同一个前端按钮组件，但字体处理方式完全相反——这是本项目最容易踩坑的地方。

|  | docx | PDF |
| --- | --- | --- |
| 生成方式 | `docx` 库代码构建（`server/src/docx.ts`） | PDFKit 直接绘制（`server/src/pdf.ts`） |
| 接口 | `POST /api/resumes/:id/export/docx` | `POST /api/resumes/:id/export/pdf` |
| 字体来源 | **打开方本机**：前端用 canvas 测宽探测本机装了候选清单（`FONT_CANDIDATES`）里的哪个字体，把名字传给后端，后端白名单校验后写进文档默认样式 | **服务端内嵌**：思源黑体（Noto Sans SC）静态字重完整嵌入 PDF，与打开方环境无关 |
| 产出物体积 | 小（不嵌字体） | 小（PDFKit 按用字自动子集化，10MB 源字体 → 几十 KB） |
| 用途 | 给用户自行编辑 | 最终交付物，字体与分页跨机器一致 |

**为什么 docx 不嵌字体**：已完整排查过（fontTable、关系、Content_Types、name 表、`w:sig`、cmap、完整字体与子集字体对比），OOXML 结构逐项正确，但 Mac 版 Word 仍会对同一段落内的字符做不一致替换——这是 Word 自身的问题，不是我们的实现问题。docx 维持「探测本机字体」方案即可，**不要再尝试嵌入**。

**为什么 PDF 不走 docx 中间产物**：曾用「导出 docx → 本机 Word/WPS 另存 PDF」，质量取决于用户环境，且被上一条卡死。改用 PDFKit 直接绘制后，字体嵌入由我们掌控。

**共同约定**

- 版式数值**只**读 `shared/style-constants.ts`，`docx.ts` 与 `pdf.ts` 两侧都禁止硬编码；改版式必须同时看这两个文件（排版逻辑有两份实现，是这套方案的已知代价，换来的是 PDF 不依赖用户环境）。
- 前端只有一个 `ExportButton`（`client/src/components/export-button.tsx`），用 `format: 'docx' | 'pdf'` 决定接口路径与文案；两者都先 `flushDraft()` 再请求，避免导出旧内容。`fontFamily` 探测只在 docx 时执行。
- **变量字体不能直接用**：思源黑体官方包是变量字体，PDFKit 不支持；且其默认实例是 Thin(100)，实例化后若不重建 name 表，family 名会带 Thin 后缀导致字体匹配失败。静态字重的一次性生成脚本见 `pdf-export-plan.md`。
- **导出必须内嵌照片**：原 Word 简历的证件照用的是外链（`file:///...`），收件人打开会看不到图，不要沿用这种写法。
- **不做浏览器打印预览**：曾经的 `/preview` 路由已删除，不要恢复。浏览器渲染的字体、行距、分页无法与服务端输出对齐，维护两套只会互相打架。要看效果就打开导出的 docx / PDF。
- 版式映射表与实施细节见 `pdf-export-plan.md`。

## 简历结构（模块顺序固定）

基本信息 → 教育经历 → 专业技能 → 工作经历 → 实习经历 → 项目经历 → 页脚

字段定义见 `project-scope.md` 的「简历结构」。注意：
- 工作 / 实习经历的「概述」为可选字段。
- 专业技能与各经历的要点列表都带数字编号，编号按条目各自从 1 开始。
- 教育经历允许多条。
- 页脚为手填文本，留空则不输出。

## 排版参数

字体、字号、行距、页边距、标题样式（白字黑底）、要点列表缩进等数值，提取自原 Word 简历，见 `tech-stack.md` 的「样式来源」表。实现时以该表为准。

## 组件测试

与 e2e 分层：**e2e 管「点下去真的发生了什么」，组件测试管渲染分支**（空状态、占位文案、按权限决定按钮有无、请求过程中的文案）。跑得快、不依赖服务与数据库，所以穷举分支的成本低；反过来只靠 e2e 才能验证的行为（草稿落库、导出产物、窄屏排版这类观感回归）**不要**搬到这里。

- 框架：**Bun 内置 `bun test` + `@testing-library/react` + happy-dom**，不引入 Vitest / Jest。依赖装在 `client/`，命令 `bun run test:component`（即 `bun run --filter client test`，`client/package.json` 的 `test` 脚本是 `bun test`）。
- 测试文件与源码同目录，命名 `*.test.tsx`（如 `client/src/pages/versions.test.tsx`）。构建时 `tsc -b` 会把它们一起过类型检查，因此 `client/tsconfig.app.json` 的 `types` 里带了 `@types/bun`（提供 `bun:test` 的类型）。
- DOM 环境：`client/bunfig.toml` 的 `[test] preload` 指向 `client/src/test/setup.ts`，由它注册 happy-dom 的全局 `window` / `document`。preload 早于测试文件的静态 import，所以渲染时 DOM 已就绪。
- **数据来源一律用 `mock.module` 替掉 `client/src/lib/*` 的 react-query hooks**，不搭 QueryClient、也不 mock fetch：组件取数全走这些 hooks，替掉它们就等于给了组件确定的数据。**mock 必须在导入被测组件之前注册**，所以被测组件用 `await import()` 动态导入——静态 import 会被提升到注册之前，拿到的还是真实模块。
- 断言用户可见的文案与角色，不断言 CSS 类名（与 e2e 同一条要求）；一个用例只讲一件事，同一行为的多种路径合进一个用例。

## E2E 测试

- 框架：Playwright（`@playwright/test`，仓库根安装）。测试在 `e2e/`，配置在 `playwright.config.ts`。
- **测试验证交给 `e2e-tester` agent 执行**：功能新增或改动后，用 e2e-tester 子代理完成 e2e 测试的编写与运行验证，不要自己手跑代替。
- **e2e 层只写端到端**：走真实浏览器 + 真实后端，不写接口级（`request`）测试；断言聚焦用户可见行为。渲染分支改由上面的组件测试覆盖。
- **一个用例只讲一件事，避免重复**：同一行为的多种路径用循环或串行步骤合进一个用例，不拆成多个。
- **复用系统 Chrome**：配置用 `channel: 'chrome'`，不下载 Playwright 自带 Chromium。变更运行机器时若 Chrome 非默认路径，需调整。
- **测试起自己的一套前后端**：`e2e/env.ts` 把 `SQLITE_PATH` 钉到 `e2e/.db/e2e.sqlite`，端口用 5200（前端）/ 3100（后端），`webServer.command` 会把这两组环境变量注入 `bun run dev`，并且 `reuseExistingServer: false`。**不复用已在跑的 dev**——那套连的是主库，复用就等于测试打到你自己的数据上；这样也就能边跑测试边开着 dev。
- **测试脚本不能 import `bun:sqlite`**：Playwright 的 globalSetup 与 worker 跑在 **Node** 里（`bun run test:e2e` 只是用 bun 起脚本，真正的 `playwright test` 由 shebang 交给 node 执行）。所以 `e2e/db.ts` 改用 Node 内置的 `node:sqlite` 读写同一个库文件，表名与列名对齐 `server/src/schema.ts`。
- **测试里的管理员是 `e2e-tester`**：`playwright.config.ts` 的 webServer 注入 `ADMIN_USERNAME=e2e-tester`，否则备份相关用例根本没法跑。
- **假邮件服务**：涉及发信的功能（版本「发送到邮箱」）需要被测服务配 `MAIL_API_KEY` 才走真实链路，否则直接 503。`playwright.config.ts` 的 webServer 是数组，除前后端外另起 `e2e/fake-mail-server.ts`（端口 5400），并把 `MAIL_API_URL` / `MAIL_API_KEY` 指到它——全程不碰真实邮件 API，用例通过 `GET /mails` 取回收件（见 `e2e/mail.ts`）。**副作用**：配了 Key 后「每月备份邮件」定时器也会启用，启动约 30 秒后往同一地址发一封整库备份，所以断言一律按 subject 过滤，不要用「收到几封」这种总数断言。
- **必须用专用测试账号**：默认 `e2e-tester` / `e2e-tester`，由 `e2e/global-setup.ts` 在跑测试前自动创建（可用 `E2E_USERNAME` / `E2E_PASSWORD` 覆盖）。用例的 `beforeEach` 会清空该账号的全部简历，**绝不能把账号指向真实用户**，否则一次 e2e 就会删掉真数据。
- 断言 shadcn 的 `CardTitle` 时**勿用** `getByRole('heading')`：shadcn 渲染成 `div`，应改用 `getByText(...)`。
- 关键选择器：`#username`、`#password`、提交按钮文案「登录」/「登录中…」、登出按钮「登出」、链接文案「版本记录」「返回编辑」。
- 登录后的公共步骤抽在 `e2e/helpers.ts`（`loginAsDefaultUser`），各 spec 复用。
- 表单交互选择器：添加按钮用文案（如「添加教育经历」），条目内的删除与拖拽手柄用 aria-label（「删除：教育经历 1」「拖拽排序：教育经历 1」），字段用 `getByLabel('学校')` 并按 `first()` / `nth(i)` 定位。
- 拖拽用鼠标拖拽（`boundingBox` + `mouse.move/down/up`）验证，键盘拖拽在 dnd-kit 下不可靠。
- 新增功能（草稿、照片、版本、导出）每完成一步，按 `e2e/auth.spec.ts` 的写法补对应 spec。

## 演示动图录制（demo/）

对外演示用：把关键功能片段录成 GIF / MP4。四个片段——核心编辑流、草稿自动保存 + 照片上传、导入简历（真实大模型）、版本存档/恢复 + 导出。

- **与 e2e 完全隔离**：`demo/playwright.config.ts` 的 `testDir` 是 `demo/scripts`，根配置是 `./e2e`，所以 `bun run test:e2e` 天然看不到演示脚本，根配置不需要改。产物落 `demo/output/`、免登录状态落 `demo/.auth/`、库文件落 `demo/.db/`，均已 gitignore。**只有源码入库。**
- **录制也起自己的一套前后端**：`scripts/constants.ts` 把 `SQLITE_PATH` **覆盖**成 `demo/.db/demo.sqlite` 并导出端口（前端 5300 / 后端 3200），`webServer` 注入这些环境变量且 `reuseExistingServer: false`——复用已在跑的 dev 会连回主库，而录制会反复删改数据。这个副作用写在 constants.ts 里，是为了让 webServer 子进程也继承到同一个库路径。
- **`seed-demo.ts` 用 `node:sqlite` + 原生 SQL**：它同时跑在 `bun run demo:seed`（Bun）与 Playwright globalSetup（Node）两条路径上，`bun:sqlite` 在 Node 下 import 不了。开头还会借 `bun run db:migrate` 补一次表结构（单独跑 seed 时库里可能还什么都没有）。JSON 列要自己 `JSON.stringify`，日期列存毫秒数。
- **一次性依赖**：`bunx playwright install ffmpeg`（录视频必需）+ `brew install ffmpeg gifski`（转码用）。Playwright 自带的那份 ffmpeg 是给 screencast 编 vp8 的精简构建，**缺 libx264，不能拿它转 MP4**。`seed-demo.ts` 开头会检测它是否已装，缺失直接报错并给出命令。
- **录制走 `page.screencast`，不要配 `use.video`**：`use.video` 从 context 建好就开始录，准备步骤与开场白屏都会进视频；且它给每个动作加的展示高亮会在录制时引入明显延迟——实测 `mouse.up` 一次就要 600ms，同样内容录出来 **62s vs 18s**。`startClip` / `stopClip` 见 `demo/scripts/demo-utils.ts`，`fixtures.ts` 的 auto fixture 会在用例失败时兜底停止，保证视频落盘。
- **必须用专用 `demo` 账号**（`demo/scripts/constants.ts`），绝不能指向 `e2e-tester` 或真实账号：`seed-demo.ts` 会删掉该账号下的全部简历（照片与版本随外键级联）。用户名硬编码常量 + 黑名单断言，不从 argv 读。同理，重建简历会级联删掉该账号的 photos/versions，与产品「照片只增不删」的约定冲突——**只限 demo 账号**。
- **`devices['Desktop Chrome']` 自带 `1280×720` viewport**，会把配置里的 `viewport` 覆盖掉。演示配置里 `viewport` 必须写在它展开**之后**，且与 `screencast.start` 的 `size` 一致，否则画面会被缩放并在底部留一条灰边。
- **鼠标光标是自己注入的一层**（`demo-utils.ts` 的 `cursorOverlay`）：Playwright 录的是页面像素、本来没有系统光标，而 `screencast.showActions` 的内建光标是按「动作点」动画的，跟不上裸鼠标事件驱动的 dnd-kit 拖拽（拖拽只能用裸鼠标事件，见上面的 e2e 约定）。挂载**必须等 `DOMContentLoaded`**——`addInitScript` 在 document-start 执行，那时 `document.body` 还不存在，直接 `appendChild` 会静默失败、整层光标消失。演示里所有点击都要走 `moveAndClick`，否则光标不跟随。
- **节奏靠显式停顿，不用 `slowMo`**（它会把 `waitForResponse` 一起拖长，视频里全是空转）。两条实测开销决定了参数：`page.mouse.move` 每步约 46ms（所以步数压到 6，靠光标层的 CSS 过渡补间保持顺滑）、`pressSequentially` 每键约 117ms（所以只用于短字段，长文本一律 `fill`）。一闪而过的中间态用**只延迟、不改语义**的 `page.route` 放大：草稿 PATCH 延迟 700ms 才能录到「保存中…」，照片 POST 延迟 900ms 才能录到「上传中…」。
- **片段 3 走真实大模型**（约 30s，不为演示改 mock）：解析那一步的断言要单独写 `{ timeout: 120_000 }`，按 `expect.timeout` 的默认 15s 等会误判失败。等待段由录制时写下的 `raw/03-import.marks.json` 在转码时裁掉，首尾各留 2s（「解析中，预计 10~60 秒…」本身有信息量，全删反而突兀）。
- **片段按文件名顺序串行、状态递进**（workers: 1），单独重录某条前必须先 `bun run demo:seed`。每片段开头调 `e2e/db.ts` 的 `clearRateLimits()`，否则反复重录自己就撞 429（导入只有 2 次/分钟）。
- **转码：GIF 用 gifski、MP4 用 ffmpeg**（`demo/scripts/convert.ts`）。gifski 走跨帧调色板且只编码变化区域，比 ffmpeg 的 `palettegen`（全局 256 色，中文抗锯齿字发灰）明显好。体积第一杠杆是 `--width`；单条 GIF 超 2.5MB 脚本会打印告警。中间产物是 `raw/*.webm`，重录后只跑 `demo:convert` 即可，不必重录。
- **导出片段的已知局限**：下载由浏览器接管，录不到下载栏，页面内也确实没有任何成功提示，所以画面里只能看到「导出中…」。脚本用 `waitForEvent('download')` 把产物存到 `demo/output/downloads/`，确认导出真的成功了；**不在页面里伪造提示 UI**。
- 证件照优先用 `demo/assets/photo.jpg`（放真实照片观感明显更好），没有则由 `demo/scripts/photo.ts` 用 canvas 画一张占位图。
- 逐条实现的取舍、四个片段的完整编排与排障记录见 `demo-recording-plan.md`；改这块时两处一起更新。

## 数据备份（管理员）

整个应用的数据就是一个 `.sqlite` 文件，所以备份功能就是把这份文件搬进搬出。实现集中在 `server/src/backup.ts` + `server/src/routes/admin.ts`，前端在 `/admin`。

- **只有 `ADMIN_USERNAME` 指定的账号能用**：路由上是 `requireAuth` + `requireAdmin`，前端还有 `RequireAdmin` 守卫、列表页按 `isAdmin` 决定是否渲染入口。**未配置该变量时视为没人有权限**，接口一律 403——宁可功能不可用，也不默认把「整库替换」的口子开着。管理员是每次请求现查用户名，改 `.env` 重启即生效，不需要迁移。
- **导出走 `VACUUM INTO`**：SQLite 官方推荐的备份方式，产出一致快照，且不像 `VACUUM` 那样需要写锁，正在写入时也能安全取一份。**不要**改成直接拷 `.sqlite` 文件——WAL 里可能还压着没落盘的事务。
- **导入是整库覆盖，且不换库文件**：`ATTACH` 上传的文件，在一个事务里清空六张表再整表搬过来，提交前跑 `PRAGMA foreign_key_check`。踩过的坑：先试的是「断开连接 → 覆盖文件 → 重连」，在 Bun 下走不通——drizzle 会缓存 prepared statement，而 `sqlite3_close_v2` 在还有未 finalize 的语句时并不会真正关闭连接，旧句柄继续握着文件锁，重连报 `SQLITE_BUSY`。SQL 级还原顺带还拿到了原子性：失败即回滚，库不会停在半截状态。
- **搬运期间必须关掉外键**：`Resume.photoId` 与 `Photo.resumeId` 互相引用，排不出让外键在每一步都成立的插入顺序。注意 `PRAGMA foreign_keys` 在事务里会被忽略，必须在 `BEGIN` 之前设置。
- **覆盖前一定留后路**：先把当前库另存为 `<库文件>.bak-<时间戳>`，误操作可以拿它还原（当普通备份文件导入即可）。
- **跨版本的备份直接拒绝**：校验时比对上传文件与当前库的 `__drizzle_migrations` 记录，不一致就 400 并说明原因——搬进来只会让后续查询报错。
- **导入后要求重新登录**：`Session` 表被一起还原，当前会话可能已经失效，前端拿到成功响应后直接回登录页。
- 上传走二进制体（`Content-Type: application/octet-stream`），这两个 POST 接口单独挂 `express.raw`（200mb 上限），因为全局 `express.json` 只有 2mb。
- **每月自动发一封备份邮件**（`server/src/backup-scheduler.ts` + `server/src/mail.ts`）：定时器每小时醒一次，只判断「本月是否已发」，没发过就取一份快照当附件发到 `MAIL_TO`（收件人只在 `.env` 里配，仓库里不写真实地址）。**不要改成「定时到一个月后」**——部署重启、容器迁移会把计时器清零，月度任务错过就是整月空档；现在重启/宕机/漏跑都能自动补上，同月也不会重复发。已发月份记在 `<库文件>.backup-mail.json`（与库同目录，落在挂载卷里），**刻意不建表**：新增表会改变迁移哈希，而备份导入按迁移哈希做跨版本校验，那会把已有导出文件全判成「跨版本」而拒收。
- **版本的「发送到邮箱」也是管理员能力**（`POST /api/admin/resumes/:resumeId/versions/:versionId/email`）：把某个存档版本现做成 Word + PDF 一起发出，取的是**版本快照**而不是当前草稿，docx 字体仍沿用前端探测的结果。入口按钮在版本列表里，按 `isAdmin` 决定是否渲染；普通账号直接打接口是 403，未配邮件通道是 503。
- **发信走第三方邮件 API 的 HTTP 接口，不走 SMTP**：云端平台对出站 25/465 端口常有封锁。请求体按 Resend 约定组织（`attachments` 里 base64 的 `content`），换服务商只改 `MAIL_API_URL`。失败退避 6 小时重试，错误原文记进状态文件。手动补发用 `bun run backup:mail`，发成功后本月不会再自动发第二封。

## 部署（Railway）

单服务部署：Express 一个进程同时提供 `/api` 接口与前端构建产物（`client/dist`），前后端同源。因此**不涉及 CORS，session cookie 配置也不需要改**。跑在**单实例**上——SQLite 单写者，不要开多个副本，多个进程写同一个文件会直接变成 500。

- **静态托管仅在生产生效**（`NODE_ENV=production`）：`express.static` + SPA fallback。开发期前端仍由 Vite dev server 提供，访问 `:3000` 不会看到过期构建。
- **SPA fallback 只对无扩展名路径生效**：`/resumes/:id/edit` 这类深链刷新要回 `index.html`；但缺失的 `/assets/*.js` 必须保持 404，回 HTML 会让浏览器按 JS 解析报错。`/api` 的 404 也不能被吞掉。
- **`app.set('trust proxy', 1)` 仅生产启用**：平台在边缘终止 TLS，不信任代理时 `req.secure` 恒为 false，`secure` cookie 不下发，表现为「登录成功却立刻掉线」。本地验证时需带 `X-Forwarded-Proto: https` 才会下发 cookie。
- **部署配置在 Railway 面板，不放仓库**：Railway 的 Config as Code（`railway.toml` / `railway.json`）已废弃，**新服务无法启用**，只有旧服务仍会读取，且其优先级高于面板设置。因此不要提交这类文件，否则会静默压掉面板里的配置。面板路径：服务 → Settings → Build / Deploy。
- **面板需要设置**：Build Command 为 `bun run build`；Start Command 为 `bun run start`；Healthcheck Path 为 `/api/health`。**不再需要 Pre-deploy Command**：迁移改由服务启动时自动执行（`server/src/db.ts` 载入即跑 `migrate()`），也不再需要 Postgres 服务。
- **必须挂 Volume 并把 `SQLITE_PATH` 指过去**：库文件默认落在 `server/data/app.sqlite`，而容器文件系统是临时的——**不挂持久卷的话每次重新部署数据全丢**。挂上卷后在面板设 `SQLITE_PATH=/data/app.sqlite`（目录由 `db.ts` 启动时 `mkdirSync` 创建）。
- **Start Command 必须显式指定**：Railpack 会自动把 Vite 产物识别成纯静态站点并改用 Caddy 托管，那样 Express 根本不启动、接口全挂。显式指定才能关掉该行为。
- **环境变量**（面板服务变量）：`SQLITE_PATH`（指向卷内路径）、`SESSION_SECRET`（必须跨部署固定，否则每次部署全体掉线）、`ADMIN_USERNAME`（要用备份功能就得设，且跨部署保持一致）、`NODE_ENV=production`。`PORT` 由平台注入；`LLM_*`、`MAIL_*` 按需设置。
- **迁移产物要跟着进镜像**：`server/drizzle/` 是服务启动时跑迁移的依据，必须提交进仓库、随源码进镜像，**不要**加进 `.gitignore`。
- **不再有代码生成这一步**：Drizzle 运行时直接用 `server/src/schema.ts`，Prisma 时期那套「生成产物进镜像 / `trustedDependencies` 放行 postinstall / 显式声明 `@prisma/client-runtime-utils` / 构建前先跑 `db:generate`」的麻烦都不存在了。
- **登录账号需手工 seed 一次**：`db:seed` 是按 username 幂等 upsert 且会更新密码，放进部署流程等于每次部署重置密码。
- **迁移失败的表现是启动就挂**：`db.ts` 在模块载入时跑 `migrate()`，所以迁移出错会让进程直接启动失败、健康检查不过，而不是以前那种「部署成功、页面能打开，但迁移没跑」的中间态。最常见的原因是库文件所在目录不可写、或者卷没挂上。
- e2e 跑的是开发模式，静态托管分支不会生效，因此该套件**不覆盖**生产托管与 SPA fallback——这部分靠本地生产模式启动 + 平台实测验证。

## Git

- 提交信息用中文，概括本次改动。
- 每次提交前确认 `.env` 未进入暂存区。
- 变更分 step 推进，一个 step 完成后及时提交。