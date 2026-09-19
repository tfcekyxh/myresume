# 项目约定

简历 Web 应用：填表 → 自动存草稿 → 手动存版本 → 导出 docx（用 Word 打开预览、另存 PDF）。

## 文档索引

| 文档 | 用途 |
| --- | --- |
| `project-scope.md` | 需求与行为、简历结构定义 |
| `tech-stack.md` | 技术选型与实现约定、排版参数（样式来源） |
| `impl-plan.md` | 分步实施计划（Step 1~16） |

改需求或新增实现约定前，先对应更新这几份文档。

## 技术栈

- 运行时 / 包管理：Bun 1.4.2
- 前端：React 19 + TypeScript + Vite 8，Tailwind CSS，shadcn/ui（源码拷贝式）
- 服务端：Express 5 + zod（DTO 校验）
- ORM：Prisma 7.10.0（连接串在 `prisma.config.ts`，运行时显式传驱动适配器）
- 数据库：PostgreSQL（阿里云 RDS）
- 鉴权：express-session + connect-pg-simple（数据库 Session）
- 密码哈希：`Bun.password`（内置 argon2id）
- 导出：`docx` 库代码构建；版式由 Word 渲染，不在浏览器里复刻
- 工程：Bun workspaces：`client/` + `server/` + `shared/`

## 目录结构

```
client/         React 前端
server/          Express 后端 + Prisma
  .env          数据库连接串、SESSION_SECRET（不入库）
  prisma/        schema + migrations + seed.ts
shared/          前后端共享：zod schema、类型、样式常量
e2e/             Playwright 端到端测试
playwright.config.ts
```

## 常用命令

```bash
bun install              # 工作区安装依赖
bun run dev              # 同时起前后端
bun run db:generate      # 生成 Prisma Client
bun run db:migrate       # 建表/改表（开发期）
bun run db:seed          # 预置账号
bun run test:e2e         # 跑 Playwright 端到端测试
bun run test:e2e:ui      # 可视化 UI 模式
```

需在 `server/` 目录下执行 Prisma 命令（Bun 隔离安装，依赖在各 workspace 内）。

## 环境变量

- 只在 `server/.env`，不入库。`.env.example` 提交。
- Bun 运行时自动从 cwd（`server/`）加载 `.env`。
- Prisma CLI 不自动加载，由 `prisma.config.ts` 里的 dotenv 显式读取 `server/.env`。

## 开发顺序

- **先前端，后后端**：每个 step 先把页面与交互做出来、能在浏览器里看到效果，再做后端接口与数据落库。
- 接口契约以 `shared/` 的 zod schema 为准，前端先按契约调用，后端补齐时保持字段一致。

## 关键实现约定

- **草稿保存**：debounce 1s 整体 `PATCH /api/resumes/:id/draft`；`visibilitychange`（hidden）与 `pagehide` 时用 `fetch(..., { keepalive: true })` 立即补发一次（sendBeacon 只能发 POST，与 PATCH 接口不符）。
- **草稿与版本**：草稿（`resumes.data`）是唯一的工作区，编辑时自动保存覆盖它；版本（`resume_versions.snapshot`）是**只读快照**，只在点「存档」时产生，产生后永不改变。恢复 = 用快照覆盖草稿。版本列表顶部固定显示一条「当前草稿（未存档）」，内容随编辑实时更新，只可查看、不可恢复。照片跟随版本（`resume_versions.photo_id`）。
- **照片**：base64 存独立 `photos` 表，简历与快照只存 `photo_id` 引用；`photos` 只增不删。前端必须压缩后再传。
- **简历结构**：只定义一份 zod schema 于 `shared/`，前端表单、后端校验、docx 生成三处复用。
- **编辑页表单**：单层 `useForm<ResumeData>` + `zodResolver(resumeDataSchema)`，用 `FormProvider` 下发，各模块组件通过 `useFormContext` 读写。可多条目模块用 `useFieldArray` + dnd-kit，拖拽结束调 `move()` 而非直接改数组。
- **要点列表**：`points` 是嵌套在条目内的字符串数组，RHF 的路径类型推导不到，改用 `useWatch` + `setValue` 手动维护增删（因此不支持拖拽）。
- **样式**：排版参数集中在 `shared/style-constants.ts`，前端 CSS 与后端 docx 共同读取，禁止两侧硬编码。
- **多简历**：`user 1:N resume 1:N resume_version`。一个人可以有多份简历（前端 / 后端 / 全栈），每份各有自己的草稿与版本记录。登录后进 `/resumes` 列表页选一份，再进 `/resumes/:resumeId/edit`、`/versions`；**resume id 从 URL 取**，刷新与分享链接都能落到同一份。接口：`GET/POST /api/resumes`、`GET/PATCH/DELETE /api/resumes/:id`。
- **不做浏览器打印预览**：曾经的 `/preview` 路由已删除。版式只在 `server/docx.ts` 里实现一份，导出后由 Word 渲染；浏览器渲染无法与 Word 对齐，维护两套只会互相打架。要看效果就用 Word/WPS 打开导出的 docx。
- **docx 导出必须内嵌照片**：原 Word 简历的证件照用的是外链（`file:///...`），收件人打开会看不到图，不要沿用这种写法。

## 简历结构（模块顺序固定）

基本信息 → 教育经历 → 专业技能 → 工作经历 → 实习经历 → 项目经历 → 页脚

字段定义见 `project-scope.md` 的「简历结构」。注意：
- 工作 / 实习经历的「概述」为可选字段。
- 专业技能无编号，其余要点列表带数字编号。
- 教育经历允许多条。
- 页脚为手填文本，留空则不输出。

## 排版参数

字体、字号、行距、页边距、标题样式（白字黑底）、要点列表缩进等数值，提取自原 Word 简历，见 `tech-stack.md` 的「样式来源」表。实现时以该表为准。

## E2E 测试

- 框架：Playwright（`@playwright/test`，仓库根安装）。测试在 `e2e/`，配置在 `playwright.config.ts`。
- **测试验证交给 `e2e-tester` agent 执行**：功能新增或改动后，用 e2e-tester 子代理完成 e2e 测试的编写与运行验证，不要自己手跑代替。
- **只写端到端**：走真实浏览器 + 真实后端，不写接口级（`request`）测试；断言聚焦用户可见行为。
- **一个用例只讲一件事，避免重复**：同一行为的多种路径用循环或串行步骤合进一个用例，不拆成多个。
- **复用系统 Chrome**：配置用 `channel: 'chrome'`，不下载 Playwright 自带 Chromium。变更运行机器时若 Chrome 非默认路径，需调整。
- 配置项 `reuseExistingServer: true`、`webServer.command: 'bun run dev'`：若 dev 已起则复用，否则自动拉起前后端。
- **必须用专用测试账号**：默认 `e2e-tester` / `e2e-tester`，由 `e2e/global-setup.ts` 在跑测试前自动创建（可用 `E2E_USERNAME` / `E2E_PASSWORD` 覆盖）。用例的 `beforeEach` 会清空该账号的全部简历，**绝不能把账号指向真实用户**，否则一次 e2e 就会删掉真数据。
- 断言 shadcn 的 `CardTitle` 时**勿用** `getByRole('heading')`：shadcn 渲染成 `div`，应改用 `getByText(...)`。
- 关键选择器：`#username`、`#password`、提交按钮文案「登录」/「登录中…」、登出按钮「登出」、链接文案「版本记录」「返回编辑」。
- 登录后的公共步骤抽在 `e2e/helpers.ts`（`loginAsDefaultUser`），各 spec 复用。
- 表单交互选择器：添加按钮用文案（如「添加教育经历」），条目内的删除与拖拽手柄用 aria-label（「删除：教育经历 1」「拖拽排序：教育经历 1」），字段用 `getByLabel('学校')` 并按 `first()` / `nth(i)` 定位。
- 拖拽用鼠标拖拽（`boundingBox` + `mouse.move/down/up`）验证，键盘拖拽在 dnd-kit 下不可靠。
- 新增功能（草稿、照片、版本、导出）每完成一步，按 `e2e/auth.spec.ts` 的写法补对应 spec。

## 部署（Railway）

单服务部署：Express 一个进程同时提供 `/api` 接口与前端构建产物（`client/dist`），前后端同源。因此**不涉及 CORS，session cookie 配置也不需要改**。

- **静态托管仅在生产生效**（`NODE_ENV=production`）：`express.static` + SPA fallback。开发期前端仍由 Vite dev server 提供，访问 `:3000` 不会看到过期构建。
- **SPA fallback 只对无扩展名路径生效**：`/resumes/:id/edit` 这类深链刷新要回 `index.html`；但缺失的 `/assets/*.js` 必须保持 404，回 HTML 会让浏览器按 JS 解析报错。`/api` 的 404 也不能被吞掉。
- **`app.set('trust proxy', 1)` 仅生产启用**：平台在边缘终止 TLS，不信任代理时 `req.secure` 恒为 false，`secure` cookie 不下发，表现为「登录成功却立刻掉线」。本地验证时需带 `X-Forwarded-Proto: https` 才会下发 cookie。
- **部署配置在 Railway 面板，不放仓库**：Railway 的 Config as Code（`railway.toml` / `railway.json`）已废弃，**新服务无法启用**，只有旧服务仍会读取，且其优先级高于面板设置。因此不要提交这类文件，否则会静默压掉面板里的配置。面板路径：服务 → Settings → Build / Deploy。
- **面板需要设置**：Build Command 为 `bun run db:generate && bun run build`；Pre-deploy Command 为 `bun run db:migrate:deploy`（迁移失败则部署中止，旧版本继续服务）；Start Command 为 `bun run start`；Healthcheck Path 为 `/api/health`。
- **Start Command 必须显式指定**：Railpack 会自动把 Vite 产物识别成纯静态站点并改用 Caddy 托管，那样 Express 根本不启动、接口全挂。显式指定才能关掉该行为。
- **环境变量**（面板服务变量）：`DATABASE_URL`（引用 Postgres 服务的 `${{Postgres.DATABASE_URL}}`）、`SESSION_SECRET`（必须跨部署固定，否则每次部署全体掉线）、`NODE_ENV=production`。`PORT` 由平台注入。
- **`prisma` 与 `dotenv` 放在 `dependencies`（而非 devDependencies）**：`prisma.config.ts` 顶层 import 了 `dotenv`，且 `prisma migrate deploy` 要在 pre-deploy 阶段的应用镜像里可用。
- **Prisma Client 生成到源码目录**（`server/src/generated/`，见 `schema.prisma` 的 generator `output`），不放默认的 `node_modules/.prisma`。默认位置依赖 postinstall，而平台 install 阶段拿不到 schema、且 `node_modules` 可能被重建，运行时就会报 `Cannot find module '.prisma/client/default'`。该目录已 gitignore，构建时必须先跑 `db:generate`。引用点：`server/src/db.ts`、`server/prisma/seed.ts`、`e2e/db.ts` 三处从生成目录导入。
- **`@prisma/client-runtime-utils` 需显式声明为 server 依赖**：生成代码运行时会 require 它，而 Bun 隔离安装不会把传递依赖提升到顶层，源码目录里的生成代码就解析不到。
- **登录账号需手工 seed 一次**：`db:seed` 是按 username 幂等 upsert 且会更新密码，放进部署流程等于每次部署重置密码。
- **迁移没跑的表现**：登录报 `P2021: The table public.User does not exist`，即 pre-deploy 未执行。注意 Railpack 会自动识别根 `package.json` 的 build/start 脚本，所以「部署成功、页面能打开」**不代表**迁移跑过。
- e2e 跑的是开发模式，静态托管分支不会生效，因此该套件**不覆盖**生产托管与 SPA fallback——这部分靠本地生产模式启动 + 平台实测验证。

## Git

- 提交信息用中文，概括本次改动。
- 每次提交前确认 `.env` 未进入暂存区。
- 变更分 step 推进，一个 step 完成后及时提交。