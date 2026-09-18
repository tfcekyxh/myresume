# 实施计划

配套文档：[project-scope.md](./project-scope.md)（需求与行为）、[tech-stack.md](./tech-stack.md)（选型与实现约定）

<br />

## 前置阻塞项

两项输入未确认会阻塞对应步骤，需要先给：

| 输入 | 阻塞步骤 | 缺了会怎样 |
| --- | --- | --- |
| Word 简历文件 | Step 9、15 | 无法确定字体、字号、行距、页边距，导出样式只能靠猜 |
| 简历模块与字段清单 | Step 3、10 | 无法定义 zod schema 与表单结构 |

Step 1、2、4~8 不依赖以上输入，可先推进。

**已定**：`user 1:N resume 1:N resume_version`，表按 1:N 建，UI 先当 1:1 用（不暴露列表页）。接口路径从一开始就带 resume id。

<br />

## 阶段 A：工程骨架与数据层

### Step 1　初始化 Bun workspaces

**目标**：client / server / shared 三个包各自能跑起来。

**产出**

- 根 `package.json` 声明 `workspaces: ["client", "server", "shared"]`
- `client/`：Vite + React 19 + TypeScript
- `server/`：Express + TypeScript 骨架，提供 `GET /api/health` 返回 `{ ok: true }`
- `shared/`：只放类型与 schema，不单独构建，由另两端直接引用
- `.env.example`：`DATABASE_URL`、`SESSION_SECRET`

**验证**

- `bun install` 无报错，生成 `bun.lock`
- `bun run --filter '*' dev` 能同时起前后端
- `curl localhost:3000/api/health` 返回 `{"ok":true}`

<br />

### Step 2　数据库与 Prisma

**目标**：四张业务表建好，预置账号可登录（此时还没有登录接口，只验证数据）。

**产出**

- `docker-compose.yml` 起本地 PostgreSQL 16，或使用本机实例
- `prisma/schema.prisma` 定义 `User`、`Resume`、`Photo`、`ResumeVersion`
- 首个 migration
- `prisma/seed.ts`：用 `Bun.password.hash()` 写入预置账号

**验证**

- `bunx prisma migrate dev` 成功，四张表出现在库中
- 执行 seed 后 `bunx prisma studio` 能看到用户记录，`password_hash` 是 argon2id 格式
- `Resume.userId` 是普通索引（非唯一约束），`Resume.title` 存在，为将来支持多份简历留出空间

<br />

### Step 3　shared 层：简历 zod schema

**目标**：简历结构只定义一次，前后端与导出共用。

**产出**

- `shared/resume-schema.ts`：定义各模块与字段的 zod schema
- 导出 `ResumeData` 类型（`z.infer`）
- 导出模块元信息（模块 key、标题、是否可多条目），供编辑页动态渲染

**验证**

- `client` 与 `server` 都能 `import` 该 schema 且类型正确
- 故意传一个非法字段，`schema.safeParse()` 返回失败

<br />

## 阶段 B：后端接口

### Step 4　鉴权

**目标**：能登录、能登出、受保护接口能拦住未登录请求。

**产出**

- `express-session` + `connect-pg-simple` 接入，`createTableIfMissing: true`、`rolling: true`、30 天有效期
- `POST /api/auth/login`：`Bun.password.verify()` 校验，写 `req.session.userId`
- `POST /api/auth/logout`：`req.session.destroy()` + 清 cookie
- `GET /api/auth/me`：返回当前用户
- `requireAuth` 中间件
- Vite `server.proxy` 把 `/api` 转发到 3000

**验证**

- `curl -c jar.txt -X POST localhost:3000/api/auth/login -d '{"username":"...","password":"..."}' -H 'Content-Type: application/json'` 返回 200 且 jar 中有 `connect.sid`
- `curl -b jar.txt localhost:3000/api/auth/me` 返回用户信息
- 不带 cookie 访问 `/api/auth/me` 返回 401
- 登出后再访问返回 401

<br />

### Step 5　草稿读写接口

**目标**：草稿能存能取。

**产出**

- `GET /api/resumes/current`：返回该用户唯一那份简历（含 `id`、`data`、`photoId`），不存在则自动创建
- `PATCH /api/resumes/:id/draft`：zod 校验后用整份 JSON 覆盖 `resumes.data`

**验证**

- `PATCH` 一个合法 JSON 后再 `GET /api/resumes/current`，返回内容一致
- `PATCH` 一个不符合 schema 的 JSON，返回 400 且错误信息可读
- 两个不同账号的草稿互不可见
- 访问他人的 resume id 返回 404，而非返回数据

<br />

### Step 6　照片上传接口

**目标**：照片单独入库，重复上传不产生新行。

**产出**

- `POST /api/resumes/:id/photo`：接收 base64，插入 `photos` 行并更新 `resumes.photo_id`
- 上传前比对内容（base64 哈希）与当前照片是否相同，相同则复用现有 `photo_id`
- 照片大小上限校验（如 500 KB），超限返回 400

**验证**

- 上传一张图后 `photos` 多一行，`resumes.photo_id` 指向它
- 再上传同一张图，`photos` 行数不变
- 上传另一张图，`photos` 多一行，`photo_id` 改变，旧行仍在

<br />

### Step 7　版本接口

**目标**：存档、列表、查看、恢复四个动作可用。

**产出**

- `POST /api/resumes/:id/versions`：把当前 `data` 与 `photo_id` 存入快照，可带备注
- `GET /api/resumes/:id/versions`：返回列表（时间 + 备注，不含快照本体）
- `GET /api/resumes/:id/versions/:versionId`：返回单条快照内容与 `photo_id`
- `POST /api/resumes/:id/versions/:versionId/restore`：用快照覆盖 `resumes.data`，并把 `photo_id` 指向该版本的 `photo_id`

**验证**

- 存档 → 修改草稿 → 恢复 → 草稿回到快照内容，`photo_id` 也回到当时的值
- 恢复不产生新版本，版本数量不变
- 恢复后旧照片行仍在 `photos` 中（历史版本靠它取图）

<br />

## 阶段 C：前端

### Step 8　前端骨架与登录页

**目标**：能登录进入编辑页，未登录被拦。

**产出**

- Tailwind CSS 接入（`@tailwindcss/vite`）
- `tsconfig` 路径别名 `@/*` → `src/*`，Vite `resolve.alias` 同步
- `npx shadcn@latest init` 并按需 add 组件
- React Router 路由：`/login`、`/edit`、`/preview`、`/versions`
- TanStack Query Provider
- 登录页（shadcn Form + react-hook-form + zod）
- 路由守卫：`GET /api/auth/me` 未通过则跳 `/login`
- 守卫通过后取 `GET /api/resumes/current`，把 resume id 存入 context，供后续所有带 `:id` 的接口使用

**验证**

- 未登录访问 `/edit` 自动跳 `/login`
- 登录成功后进入 `/edit`，刷新页面仍保持登录
- 登出后回到 `/login`

<br />

### Step 9　样式常量表

**依赖**：Word 简历文件。

**目标**：把 Word 的排版参数抽成唯一数据源。

**产出**

- `shared/style-constants.ts`：字体族、各级字号、行距、段间距、页边距、模块间距
- 供前端 CSS 变量与后端 docx 代码共同读取

**验证**

- 前端与后端均能引用，无重复定义
- 改一个值，前端预览与 docx 输出同时变化

<br />

### Step 10　编辑页：表单与动态条目

**依赖**：Step 3 的 schema、Step 9 的样式常量。

**目标**：能完整填写简历，条目可增删拖拽。

**产出**

- 按 schema 渲染各模块表单
- 可多条目模块用 `useFieldArray` 实现增删
- dnd-kit 拖拽排序，接 `useFieldArray` 的 `move()`
- 基础信息含照片上传入口（Step 12 完成前先留占位）

**验证**

- 每个模块都能新增、删除、拖拽调整条目顺序
- 必填项为空时给出校验提示
- 拖拽后表单值顺序与界面一致

<br />

### Step 11　草稿自动保存

**目标**：输入不丢。

**产出**

- 表单变化 debounce 1s 调 `PATCH /api/resumes/draft`
- `visibilitychange` / `pagehide` 时用 `navigator.sendBeacon` 补发
- 界面显示保存状态（保存中 / 已保存 / 失败）

**验证**

- 修改内容后等 1 秒，刷新页面数据仍在
- 修改内容后立刻关闭标签页，重新打开数据仍在
- 断网时显示保存失败，恢复网络后能重试成功

<br />

### Step 12　照片上传前端

**目标**：上传即压缩，避免存原图。

**产出**

- 文件选择后先用 canvas 缩放到 295×413 并转 JPEG base64（质量 0.85）
- 调 `POST /api/resumes/photo`，成功后更新预览
- 展示当前照片，支持替换

**验证**

- 上传一张 3 MB 手机原图后，库中 `photos.data` 长度在 100 KB 量级
- 同一张图重复上传，`photos` 行数不变
- 替换照片后编辑页预览同步更新

<br />

### Step 13　版本管理页

**目标**：存档、查看、恢复可操作。

**产出**

- `/versions` 列表页：时间 + 备注 + 「查看」「恢复」两个按钮
- 「查看」用 Dialog 展示该版本的只读内容与当时的照片
- 「恢复」用 AlertDialog 二次确认，提示会覆盖当前草稿
- 「存档」入口放在编辑页，可填备注

**验证**

- 存档后列表出现新记录
- 查看历史版本时显示的是当时的照片，不是当前照片
- 恢复后编辑页内容与照片同步变化
- 恢复不新增版本记录

<br />

## 阶段 D：导出与验收

### Step 14　打印预览页

**目标**：浏览器打印出的 PDF 与目标排版一致。

**产出**

- `/preview` 路由，渲染 A4 尺寸只读 DOM
- 纯 HTML + Tailwind `print:` 变体，**不使用 shadcn 组件**
- `@page { size: A4; margin: ... }`，`@media print` 隐藏导航等非内容元素
- 样式值全部来自 Step 9 的常量表

**验证**

- 浏览器打印预览中分页正确，无按钮、导航等多余元素
- 屏幕显示与打印结果一致
- 照片位置与尺寸正确

<br />

### Step 15　docx 导出

**依赖**：Step 9 的样式常量、Word 简历文件。

**目标**：导出的 docx 在 Word 中打开后与目标样式一致。

**产出**

- 用 `docx` 库以代码构建文档，样式参数读常量表
- 照片按 `photo_id` 读取后以 base64 嵌入
- `POST /api/export/docx` 返回文件流，前端触发下载
- 文件名含姓名与日期

**验证**

- 导出的 docx 用 Word 打开，字体、字号、行距、页边距与目标一致
- 中文无乱码，照片位置正确
- 内容多于一页时分页合理

<br />

### Step 16　端到端验收与收尾

**目标**：全流程可跑通，交付可用。

**产出**

- 走一遍完整链路：登录 → 填写 → 上传照片 → 自动保存 → 存档 → 改内容 → 恢复 → 导出 docx → 打印 PDF
- 补齐加载态、错误提示、空状态
- 启动说明（依赖安装、数据库、迁移、seed、开发与构建命令）

**验证**

- 上述链路无中断、无报错
- 冷启动按说明操作即可跑起来
- 两份文档与实现无矛盾

<br />

## 风险点

| 风险 | 影响步骤 | 应对 |
| --- | --- | --- |
| Prisma 在 Bun 下的 postinstall 被跳过 | Step 2 | 配 `trustedDependencies`，并把 `bunx prisma generate` 写进 `postinstall` |
| 照片被误删导致历史版本丢图 | Step 7、13 | `photos` 只增不删，不做孤儿清理 |
| 打印样式与 docx 样式不一致 | Step 9、14、15 | 所有排版参数只从常量表读，禁止在两侧硬编码 |
| `useFieldArray` 与 dnd-kit 顺序不同步 | Step 10 | 拖拽结束时调用 `move()` 而非直接改数组 |
| 前端拿不到 resume id 就调后续接口 | Step 8、10 | 守卫通过后先取 `GET /api/resumes/current`，把 id 存进 context 再渲染编辑页 |

<br />
