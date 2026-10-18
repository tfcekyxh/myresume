# 技术栈

定稿日期：2026-09-18

<br />

## 总览

| 层 | 选型 |
| --- | --- |
| 包管理与运行时 | Bun |
| 前端框架 | React 19 + TypeScript + Vite |
| 路由 | React Router |
| 样式 | Tailwind CSS |
| UI 组件 | shadcn/ui（源码拷贝式，非依赖包） |
| 表单 | react-hook-form + zod + `@hookform/resolvers` |
| 拖拽排序 | dnd-kit |
| 数据层 | TanStack Query |
| 后端 | Express + zod |
| ORM | Drizzle ORM（`drizzle-orm/bun-sqlite`） |
| 数据库 | SQLite（单文件，库文件即全部数据） |
| 鉴权 | express-session + 自建 SQLite Session store（表由 `server/src/schema.ts` 管） |
| 密码哈希 | `Bun.password`（内置 argon2id） |
| docx 导出 | `docx` 库，代码构建 |
| PDF 导出 | `pdfkit`，服务端直接绘制并完整嵌入字体（见 [pdf-export-plan.md](./pdf-export-plan.md)） |
| 简历导入 | 文件文字浏览器本地提取（`mammoth` 解析 docx、`pdfjs-dist` 解析 PDF）；结构化用大模型（OpenAI 兼容接口，默认智谱 GLM-4-Flash） |
| 证件照 | base64 存 `photos` 表，简历与快照只存 `photo_id` 引用，不做文件服务 |
| 工程结构 | Bun workspaces：`client/` + `server/` + `shared/` |

<br />

## 依赖清单

```
client: react react-dom react-router-dom tailwindcss
        react-hook-form zod @hookform/resolvers
        @tanstack/react-query @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
        lucide-react mammoth pdfjs-dist
        （另有 shadcn add 生成的 radix 组件）

server: express zod express-session drizzle-orm docx pdfkit
        -d drizzle-kit dotenv @types/express-session @types/pdfkit

shared: zod
```

被 Bun 取代、无需安装的依赖：`argon2`（用 `Bun.password`）、`tsx`/`ts-node`（直接跑 TS）、`nodemon`（`bun --watch`）、`vitest`（`bun test`）。

注意 `dotenv` **仍然需要**：Bun 运行时能自动加载 `.env`，但 drizzle-kit 不保证加载，必须在 `drizzle.config.ts` 里显式读一次。

已实测的版本：Bun 1.4.2、React 19.2.8、Vite 8.3.0、TypeScript 6.0.2、Express 5.1.0、drizzle-orm 0.45.4、drizzle-kit 0.31.11。

<br />

## 数据模型

```
User            id text pk, username text unique, passwordHash text, createdAt
Session         sid text pk, sess json, expire      -- 本应用自己管（原来那张是 connect-pg-simple 建的）
Resume          id text pk, userId, title, data json, photoId, updatedAt, lastArchivedAt
Photo           id text pk, resumeId, data text, createdAt   -- base64，只增不改
ResumeVersion   id text pk, resumeId, snapshot json, photoId, note, createdAt
RateLimit       key + windowStart 复合主键, count   -- 限流计数，key 形如 login:ip:1.2.3.4
```

表名与列名沿用 Prisma 时期的写法（模型名即表名、列名保持 camelCase），因此换 ORM 不影响库文件与备份文件的格式约定。时间列统一用 `integer` 存**毫秒数**（`mode: 'timestamp_ms'`），JSON 列存 JSON 文本、由 Drizzle 负责 stringify/parse。

关系为 `user 1:N resume 1:N resume_version`，`resume 1:N photo`（照片池）。

**多份简历，已完整支持**：`resume.user_id` 是普通索引而非唯一约束，一个人可以有多份简历（前端 / 后端 / 全栈各一份），每份各有草稿、证件照与版本记录。登录后先进 `/resumes` 列表页选一份，再进入该份的编辑 / 版本 / 预览页；接口路径带 resume id，URL 即身份（可刷新、可分享）。

`data` 存整份简历 JSON（**不含照片**），`photo_id` 指向当前使用的照片。`photos` 是只增不改的照片池，换照片即插入新行。`resume_versions` 存只读快照，同时记录当时的 `photo_id`，因此照片也被版本控制且不重复存储。

<br />

## 接口一览

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/resumes
POST   /api/resumes
GET    /api/resumes/:id
PATCH  /api/resumes/:id
DELETE /api/resumes/:id

PATCH  /api/resumes/:id/draft

GET    /api/resumes/:id/photo
POST   /api/resumes/:id/photo

GET    /api/resumes/:id/versions
POST   /api/resumes/:id/versions
GET    /api/resumes/:id/versions/:versionId
POST   /api/resumes/:id/versions/:versionId/restore

POST   /api/resumes/:id/export/docx
POST   /api/resumes/:id/export/pdf

POST   /api/import/parse              # 简历文本 → ResumeData（大模型解析）

GET    /api/admin/backup              # 导出整库快照（.sqlite 文件）
POST   /api/admin/backup/validate     # 校验上传的备份，返回内容摘要
POST   /api/admin/backup/import       # 用上传的备份整体覆盖当前库
```

路径一律带 resume id，多份简历各自独立；`/api/import/*` 是无状态解析接口，不落库、不绑定简历（覆盖表单与草稿自动保存在前端完成）。`/api/admin/*` 只对 `ADMIN_USERNAME` 指定的账号开放，其余账号一律 403。

<br />

## 关键实现约定

### 鉴权

- 账号来源：seed 脚本预置 + 页面自助注册。注册接口 `POST /api/auth/register`：用户名 ≥3 位、密码 ≥6 位，用户名唯一（重复返回 409），密码用 `Bun.password`（argon2id）哈希，注册成功即建立会话（自动登录）。注册表单含「确认密码」输入框，仅前端校验两次输入一致，提交时不传后端。
- `express-session` + 自建 store（`server/src/session.ts`）：会话行落在同一个 SQLite 库的 `Session` 表上，表结构由 Drizzle 迁移管理。不引第三方 store 包，是因为库里只有一份数据文件，整库备份时会话也跟着一起走，不需要第二个存储载体。
- `rolling: true` 实现滑动续期，有效期 30 天；过期行按 1% 概率随请求顺带清理，不引入定时任务。
- Cookie：`httpOnly`、`sameSite: 'lax'`、生产环境 `secure`。
- 登录写 `req.session.userId`，登出 `req.session.destroy()`，鉴权用 `requireAuth` 中间件读 `req.session.userId`。

### 安全设计

三块实现，全部在 `server/src/`。

**限流**（`rate-limit.ts`）

- 计数落在 `RateLimit` 表，加一由一条 UPSERT（`onConflictDoUpdate` + `returning`）完成。单机自部署只有一个进程，落库不是为了多实例共享，而是为了重启不丢当前窗口的计数，并能顺手做过期清理。
- 固定窗口，窗口起点按 `windowMs` 对齐。超限返回 429 + `Retry-After`，body 与其他接口一致用 `{ error }`，前端直接展示，无需改渲染逻辑。
- 数据库计数失败时放行并打日志，不让限流本身拖垮业务。
- 过期行（24 小时未被碰过）由请求按 1% 概率顺带清理，不引入定时任务。
- 阈值：

| 接口 | 维度 | 窗口 | 次数 |
| --- | --- | --- | --- |
| 全部 `/api/*`（兜底） | IP | 1 分钟 | 600 |
| `POST /api/auth/login` | IP | 15 分钟 | 10 |
| `POST /api/auth/register` | IP | 1 小时 | 2 |
| `POST /api/import/parse` | 用户 | 1 分钟 | 2 |
| 导出 docx / pdf（共用配额） | 用户 | 1 分钟 | 5 |
| 备份导出 / 校验 / 导入（共用配额） | 用户 | 1 分钟 | 5 |

- 维度选择的理由：登录 / 注册时还没有身份，只能按 IP；导入与导出按用户 ID，既不会因多人共用一个出口 IP 互相牵连，也能精确拦住「一个人刷爆大模型额度」。
- `rateLimit()` 返回类型的 params 泛型必须是 `any`：写成具体的宽类型会让 Express 5 反过来用它推断路由参数，把 `/:id/export/docx` 的 `req.params.id` 撑成 `string | string[]`。
- 原生 SQL 里的时间条件必须绑**毫秒数**，不能传 `Date` 对象：`bun:sqlite` 不接受 `Date` 参数，Drizzle 也不会替裸 `sql` 模板做转换，实测表现为「不报错但比较静默失效」（过期行一行都删不掉）。类型化 API（如 `lt(col, new Date())`）不受影响。

**安全响应头**（`index.ts` 的 helmet）

- CSP `default-src 'self'`；`img-src` 额外放行 `data:`（证件照是 base64）；`style-src` 带 `'unsafe-inline'`（dnd-kit 会往元素上写内联 style 属性）。
- `hsts` 只在生产下发；`referrer-policy` 用 `same-origin`（跨站不带 Referer，同源才带）。
- helmet 的类型基于 node 原生 `IncomingMessage`，与 Express 5 的 `RequestHandler` 对不上，接入处断言一次即可，运行时完全兼容。

**CSRF 兜底**（`csrf.ts`）

- 主防线仍是 `SameSite=Lax`——跨站写请求带不上 cookie。这里再按 `Origin`（缺失时退回 `Referer`）校验一次，覆盖「误把 sameSite 放宽」与「同站不同源（子域）」两种情况。
- 没有 `Origin` / `Referer` 的请求放行：非浏览器客户端不受 CSRF 影响，而浏览器发跨站写请求一定会带 `Origin`。
- Host 比对同时认 `Host` 与 `X-Forwarded-Host`。开发期前端在 5173、经 Vite 代理转发到 3000，代理必须开 `xfwd`（见 `client/vite.config.ts`）透传原始主机，否则会被误杀。

### 草稿保存

- 草稿权威存储在服务端，前端不做持久化。
- 编辑时 debounce 1s 整体 `PATCH /api/resumes/:id/draft`，提交完整 JSON，整份覆盖。
- `visibilitychange`（hidden）/ `pagehide` 时用 `fetch(..., { keepalive: true })` 立即补发一次，避免丢失最后一秒输入。不用 `navigator.sendBeacon`，因为它只能发 POST，而草稿接口是 PATCH。
- 照片不走草稿接口：上传单独走 `POST /api/resumes/:id/photo`，服务端插入 `photos` 行并更新 `resumes.photo_id`。若新照片与当前照片内容相同则不插入新行。

### 版本

- 草稿（`resumes.data`）是唯一的工作区，编辑时自动保存覆盖它；版本是**只读快照**，只在点「存档」时产生。
- 点「存档」插入一条版本，记录当时的 `snapshot` 与 `photo_id`，可带备注。产生后内容不再改变，因此随时可以安全回滚。
- 「恢复到此版本」= 用快照覆盖 `resumes.data` 与 `resumes.photo_id`；确认后直接覆盖，不做 diff、不新增记录。
- 版本列表顶部固定显示一条「当前草稿（未存档）」，内容随编辑实时更新；它只可查看，不提供恢复（它本身就是当前内容）。
- `photos` 行只增不删，被历史版本引用的照片必须保留，否则历史版本会丢图。
- 「草稿是否未存档」的判定基准是 `Resume.lastArchivedAt`（草稿最近一次被存档时的 `updatedAt`）。存档 / 恢复后要把它对齐到当前 `updatedAt`，这一步**必须走原生 SQL**：`updatedAt` 带 `$onUpdate`，任何走 Drizzle 的 update 都会顺带刷新它（见下面的「`$onUpdate` 的陷阱」）。

### 数据备份（管理员）

整库就是一个 `.sqlite` 文件，所以备份功能就是把这份文件搬进搬出，实现都在 `server/src/backup.ts`。

- **导出**用 `VACUUM INTO`：SQLite 官方推荐的备份方式，产出的是一致快照，而且不像 `VACUUM` 那样需要写锁——正在写入时也能安全取一份。直接拷 `.sqlite` 文件是不行的，WAL 里可能还压着没落盘的事务。
- **导入是整库覆盖，且不换库文件**：`ATTACH` 上传的文件，在一个事务里清空六张表再整表搬过来，提交前跑 `PRAGMA foreign_key_check`，通过才 `COMMIT`。
  - 为什么不换成「断开连接 → 覆盖文件 → 重连」：在 Bun 下走不通。drizzle 会缓存 prepared statement，而 `sqlite3_close_v2` 在还有未 finalize 的语句时并不会真正关闭连接，旧句柄继续握着文件锁，重连时报 `SQLITE_BUSY`（实测踩过）。
  - 顺带拿到了原子性：中途失败直接 `ROLLBACK`，库不会停在半截状态。
  - 搬运期间要关掉 `PRAGMA foreign_keys`：`Resume.photoId` 与 `Photo.resumeId` 互相引用，排不出让外键在每一步都成立的插入顺序。注意 PRAGMA 在事务里会被忽略，必须在 `BEGIN` 之前设置。
- **导入前一定会先留后路**：先把当前库用 `VACUUM INTO` 另存为 `<库文件>.bak-<时间戳>`，误操作可以拿它还原。
- **跨版本的备份会被拒**：校验时比对上传文件与当前库的 `__drizzle_migrations` 记录，结构不一致直接 400——搬进来会让后续查询报错，不如在这里拦住。
- 上传走二进制体（`express.raw`，200mb 上限），因为全局的 `express.json` 只有 2mb。三个接口共用一份用户维度限流。
- 导入成功后当前会话可能随之失效（`Session` 表也被还原了），所以前端拿到成功响应后直接回登录页。

### 每月自动备份邮件

实现拆两处：`server/src/backup-scheduler.ts`（何时发、状态记账）与 `server/src/mail.ts`（怎么发）。快照本身复用上面那套 `VACUUM INTO`。

- **不做「定时到一个月后」，改成每小时自检**：部署重启、容器迁移都会把计时器清零，而月度任务一旦错过就是整整一个月的空档。现在每小时醒一次、只判断「本月是否已发」，重启、宕机、漏跑都能自动补上，同一个月也不会重复发。启动后 30 秒先检查一次，把重启期间漏掉的那次补上。
- **已发月份记在 `<库文件>.backup-mail.json`**，与库同目录，所以部署时自然落在挂载的卷里。**刻意不建表**：新增表会改变迁移哈希，而备份导入是按迁移哈希做跨版本校验的（见上一条），那会把所有已有的导出文件判成「跨版本」而拒收。文件先写 `.tmp` 再改名，避免进程半途被杀留下半截 JSON。
- **发信走第三方邮件 API 的 HTTP 接口，不走 SMTP**：云端平台对出站 25/465 端口常有封锁，HTTPS 接口更稳。请求体按 Resend 的约定组织（`from` / `to` / `subject` / `text` / `attachments` 里 base64 的 `content`），换服务商时只改 `MAIL_API_URL`。代价是发件地址通常得是服务商认可的地址——Resend 未验证自有域名时只能是 `onboarding@resend.dev`，且只能发给注册邮箱，因此 `MAIL_FROM` 必须可配。
- **失败退避 6 小时重试**，错误原文（含服务商返回的报文）记进状态文件，配错 Key 时一眼能看出原因且日志压到每天 4 条。
- 手动补发用 `bun run backup:mail`：与定时器走完全相同的代码路径，发成功后本月也不会再自动发第二封——部署后当场就能验证配置对不对，不必等一个月。

### 样式来源

前端 CSS 与后端 docx、PDF 生成代码共用一份样式常量表（`shared/style-constants.ts`），改样式只改这一处，避免多条渲染路径不一致。

以下数值提取自现有 Word 简历（`20260913.docx`）：

| 常量 | 值 |
| --- | --- |
| 纸张 | A4 210 × 297 mm |
| 页边距 | 上下左右均 1.3 cm（737 twips） |
| 页脚起始位置 | 距底边 2.6 cm（1474 twips） |
| 正文字体 | DengXian（等线） |
| 正文字号 | 10 pt（sz 20） |
| 正文行距 | 1.1 倍（264/240） |
| 正文缩进 | 左右 0.35 cm（198 twips），两端对齐 |
| 章节标题 | 14 pt（sz 28）粗体，白字 + 黑色高亮底，段落下边框 0.5 pt（sz 4）#D9D9D9 |
| 条目标题行 | 12 pt（sz 24）粗体 |
| 时间文字 | #7F7F7F |
| 要点列表 | 十进制编号「1.」，左缩进 0.7 cm（397 twips），悬挂 0.35 cm（197 twips） |
| 页脚文字 | 9 pt（sz 18），左对齐 |
| 头部布局 | 双栏，栏间距 0.75 cm（425 twips），证件照浮动于右侧 |

原文档大量使用制表位（tab stops）对齐多列内容，例如教育经历用 `pos=2000/2800/9200` 把学校、学历、专业、时间排成四段。网页与 docx 生成应改用弹性布局实现同样的视觉效果，**不复刻制表位**。

<br />

### docx 导出

- 用 `docx` 库以代码构建，样式参数从共用样式常量表读取。
- 字体不内嵌：docx 只写字体名，由打开方的本机字体决定显示效果。曾尝试内嵌字体以保证跨机器一致，但 Mac 版 Word 无法可靠使用第三方嵌入字体（详见 [pdf-export-plan.md](./pdf-export-plan.md) 的排查记录），故维持「探测本机可用字体」的做法。

### PDF 导出

- 用 `pdfkit` 在服务端直接绘制，不经过 docx 中间产物，也不用浏览器打印。
- 字体用 OFL 许可的思源黑体（Noto Sans SC）静态字重，存放于 `server/assets/fonts/`，完整嵌入 PDF，收件人无需安装字体。
- PDFKit 输出时自动按实际用字子集化（实测 10.1MB 源字体 → 12.5KB PDF），因此仓库里放全量字体不会影响产出物体积。
- 中文以 `CIDFontType2` + `Identity-H` 嵌入，并带 `ToUnicode` 映射，文本可复制、可搜索。
- 不选 LibreOffice 转换：镜像 +400MB、需要 apt 依赖、冷启动慢，且仍依赖 docx 中间产物。

### 证件照

- 照片以 base64 存在独立的 `photos` 表，`resumes.data` 与版本快照里都**不存照片本体**，只存 `photo_id` 引用。不做文件服务与静态资源鉴权。
- 照片因此既不随版本重复存储，又仍然受版本控制：查看历史版本时按该版本的 `photo_id` 取图，恢复版本时照片一起回到当时那张。
- 上传时前端必须先用 canvas 压缩，不存原图：按目标宽高比**居中裁剪（cover）**再缩放（不要直接拉伸，任意比例的输入会变形），转 JPEG base64，控制在 100 KB 以内。目标像素由显示尺寸与 300 DPI 推导（1.98 × 2.2 cm → 234 × 260），**不要用标准一寸照的 295×413**，那个比例 0.714 与 1.98:2.2 = 0.9 不符，插入后会横向拉伸。
- 上传接口需比对内容（如比对 base64 哈希）与当前照片是否相同，相同则复用现有 `photo_id`，避免反复上传同一张图导致 `photos` 堆积。
- docx 生成时，照片按 `photo_id` 单独读取后并入输出。

### 简历导入

- 文件文字提取全部在浏览器本地完成，文件内容不经过我们的服务器：`.docx` 用 `mammoth.extractRawText`（走包的 browser 入口），`.pdf` 用 `pdfjs-dist` 逐页取 TextContent（worker 用 `pdfjs-dist/build/pdf.worker.min.mjs?url` 交给 Vite 打包），`.txt` / `.md` 直接 `File.text()`。图片型 / 扫描版 PDF 没有文本层，明确提示不支持，不做 OCR。
- 结构化解析在服务端：`POST /api/import/parse` 收 `{ text }`，调 OpenAI 兼容的 Chat Completions 接口（`response_format: json_object`），用 system prompt 约束输出 `ResumeData` JSON；返回前过一遍 `resumeDataSchema`，并做宽容归一化（缺字段补空串 / 空数组、超长截断、非字符串转字符串），模型偶发瑕疵不阻断导入。
- 模型配置走环境变量 `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`，默认智谱 `glm-4-flash`；**Key 只放服务端**。未配置 Key 时该接口返回 503，其余功能不受影响。
- 解析接口无状态、不绑简历、不写库；前端拿到结果先在对话框展示摘要，用户二次确认后 `form.reset(data)` 整体覆盖，后续由现有 debounce 草稿保存落库。照片不属于 `ResumeData`，导入不改照片。
- e2e 不打真实模型（慢、费、不稳定）：用 Playwright `page.route` mock `/api/import/parse`，只验证用户可见的交互链路。

<br />

## Bun 使用约定

```bash
bun install                  # 安装依赖
bun add <pkg>                # 添加依赖
bun add -d <pkg>             # 添加开发依赖
bun run dev                  # 运行脚本
bunx drizzle-kit generate    # 调用 CLI
bun --watch server/index.ts  # 服务端开发模式
bun run --filter '*' dev     # 跨 workspace 执行
```

- 提交 `bun.lock`，删除 `package-lock.json`。
- 需要 Bun >= 1.2。

<br />

## Drizzle + bun:sqlite 的实现约定

**为什么不是 Prisma**（别再往回搬）：Prisma 7 的 SQLite 适配器只支持 `better-sqlite3` 与 libSQL，而 `better-sqlite3` 是 Node 原生模块，**Bun 加载不了**——Bun 自 1.3.2 起改为快速失败并提示改用 `bun:sqlite`。岔路里剩下的社区 `bun:sqlite` 适配器还停在 alpha，不适合放进核心数据路径。Drizzle 官方一级支持 `bun:sqlite`，没有原生模块、也没有代码生成步骤，故选用它。

**1. 连接**

全程只有一个连接，在 `server/src/db.ts` 里创建：

```ts
const sqlite = new Database(SQLITE_PATH, { create: true })
sqlite.exec('PRAGMA foreign_keys = ON')   // SQLite 默认不校验外键，级联删除全靠它
sqlite.exec('PRAGMA journal_mode = WAL')
sqlite.exec('PRAGMA busy_timeout = 5000')
export const db = drizzle({ client: sqlite })
```

三条 PRAGMA 都不能省：少了 `foreign_keys` 级联删除会静默失效（删简历时照片与版本不会跟着删），少了 WAL 读写互相阻塞，少了 `busy_timeout` 会偶发 `SQLITE_BUSY`。

**2. 迁移**

- `server/src/schema.ts` 定义表，`server/drizzle.config.ts` 指向它，`drizzle-kit generate` 把 SQL 产出到 `server/drizzle/`——**产物要入库**，和以前的 Prisma migrations 一样。
- 迁移在服务启动时自动执行（`db.ts` 里调 `migrate()`）。单机单进程不存在抢迁移的问题，所以不需要 pre-deploy 阶段：换台机器把库文件拷过去再启动，结构会自动补齐。
- `drizzle.config.ts` 里 `schema` / `out` 必须给**相对路径**：给绝对路径时 drizzle-kit 会拼出 `.//Users/...` 这种畸形路径，第二次 generate 会读不到 meta 快照。该文件也拿不到 `import.meta.dirname`（是 undefined），路径一律基于 cwd，所以命令都从 `server/` 目录执行（根目录的 `db:*` 脚本走 `bun run --filter server`，cwd 天然就是它）。
- 迁移前要保证目录存在：SQLite 不会替你建目录，`db.ts` 里先 `mkdirSync`。

**3. 循环外键与类型推断**

`Resume.photoId` 与 `Photo.resumeId` 互相引用，指向后声明那一侧的 `references()` 回调必须显式写上返回类型 `AnySQLiteColumn`，否则 TypeScript 会因循环推断报 TS7022。

**4. `$onUpdate` 的陷阱**（与 Prisma 的 `@updatedAt` 是同一个）

`Resume.updatedAt` 带 `$onUpdate`，任何走 Drizzle 的 `update` 都会顺带把它刷新成当前时间。所以「把 `lastArchivedAt` 对齐到当前 `updatedAt`」这个动作必须走原生 SQL：

```ts
db.run(sql`UPDATE "Resume" SET "lastArchivedAt" = "updatedAt" WHERE "id" = ${resumeId}`)
```

否则基准永远比 `updatedAt` 早一点点，草稿会永远显示「未存档」。

<br />

## 环境变量

`.env` 放在 `server/`，因为只有服务端需要它。客户端若需环境变量，用 Vite 自己的 `.env` 与 `VITE_` 前缀。

- Bun 运行时从 cwd（`server/`）自动加载 `.env`
- drizzle-kit 由 `drizzle.config.ts` 中的 dotenv 显式加载，且必须在 `server/` 目录下执行
- `.env` 已被 `.gitignore` 覆盖，`.env.example` 提交进仓库
- `SQLITE_PATH`：库文件路径，留空则用默认值 `server/data/app.sqlite`。单机部署挂载卷时改到卷内路径（如 `/data/app.sqlite`）
- `ADMIN_USERNAME`：数据备份页与 `/api/admin/*` 的唯一管理员用户名。**留空表示没人有权限，接口一律 403**——宁可功能不可用，也不默认把这个「整库替换」的口子开着
- `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`：简历导入解析用的大模型（OpenAI 兼容接口），默认智谱 GLM-4-Flash；`LLM_API_KEY` 留空时导入功能返回 503
- `MAIL_API_URL` / `MAIL_API_KEY` / `MAIL_FROM` / `BACKUP_EMAIL_TO`：每月自动备份邮件。默认走 Resend 的 HTTP 接口，`MAIL_API_KEY` 留空时该功能关闭（与 `LLM_API_KEY` 一样不设为启动必需）；收件人默认 `your-email@example.com`，可逗号分隔多个

<br />

## SQLite / Bun 注意点

**单写者、单实例**：SQLite 允许并发读，写操作排队，配合 `busy_timeout` 足够单机自部署使用；但**不能横向扩多实例**——多个进程写同一个文件，锁竞争会直接变成 500。单机自部署本来就是这套方案的前提。

**原生 SQL 的参数只能绑基本类型**：`bun:sqlite` 接受数字、字符串、bigint、Buffer 与 null，**不接受 `Date` 对象**，而裸 `sql` 模板不会替你转换——表现是「不报错但比较静默失效」。时间条件一律传毫秒数（见 `rate-limit.ts`、`session.ts` 的过期清理）。走 Drizzle 的类型化 API（`eq` / `lt` 等）时传 `Date` 是安全的，由列类型负责往返转换。

**测试与演示脚本不能 import `bun:sqlite`**：Playwright 的 globalSetup 与 worker 跑在 **Node** 里（`bun run test:e2e` 只是用 bun 起脚本，真正的 `playwright test` 由 shebang 交给 node 执行）。所以 `e2e/db.ts` 与 `demo/scripts/seed-demo.ts` 改用 Node 内置的 `node:sqlite` 直接读写同一个库文件——它在 Bun 与 Node 下都可用，正好覆盖这两处的双运行时场景。

**Prisma 时期的那一堆坑随它一起消失了**：不需要 `output` 到源码目录、不需要 `trustedDependencies` 放行 postinstall、不需要在构建前先跑 `db:generate`、也不需要显式声明 `@prisma/client-runtime-utils`。

<br />

## 开发期注意点

Vite dev server（5173）与 Express（3000）跨源会导致 Cookie 无法携带。使用 Vite proxy 转发，让浏览器始终视为同源，避免配置 CORS 与 Cookie domain：

```ts
// vite.config.ts
server: {
  proxy: { '/api': { target: `http://localhost:${apiPort}`, changeOrigin: true, xfwd: true } }
}
```

`xfwd` 不能省：它透传原始主机名，否则 changeOrigin 改写后的 Host 与浏览器的 Origin 对不上，会被后端的 CSRF 同源校验拒掉。

前端端口与后端端口都可由环境变量覆盖（`VITE_PORT` / `API_PORT`）：**e2e 用 5200 + 3100，演示录制用 5300 + 3200**，各自起一套前后端。这样跑测试或录制时不必停掉手上的 dev；也因此两边的 Playwright 都设了 `reuseExistingServer: false`——复用已在跑的 dev 等于连回主库，隔离就白做了。

<br />

## 未定项

- `resumes` 与 user 的关系是 1:1（单份草稿）还是 1:N（可维护多份针对不同岗位的简历）。若为 1:N 需增加简历列表页。
- 现有的 Word 简历文件尚未提供，docx 的字体、字号、行距、页边距参数待定。

<br />
