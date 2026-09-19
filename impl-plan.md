# 实施计划

配套文档：[project-scope.md](./project-scope.md)（需求与行为）、[tech-stack.md](./tech-stack.md)（选型与实现约定）

<br />

## 前置条件

已全部就绪，无阻塞项。

| 输入 | 位置 |
| --- | --- |
| 需求与行为 | [project-scope.md](./project-scope.md) |
| 简历模块与字段 | [project-scope.md](./project-scope.md) 的「简历结构」 |
| 选型与实现约定 | [tech-stack.md](./tech-stack.md) |
| 排版参数 | [tech-stack.md](./tech-stack.md) 的「样式来源」 |

**已定**：`user 1:N resume 1:N resume_version`。一个人可以有多份简历（前端 / 后端 / 全栈），每份各有草稿、证件照与版本记录；登录后先进 `/resumes` 列表页选一份，再进 `/resumes/:resumeId/edit` 等页面。接口路径带 resume id。

**已知缺陷**：现有 Word 简历中的证件照是外链（`file:///.../10MB.jpg`），docx 包里没有图片本体，发给别人会丢图。Step 15 实现导出时必须内嵌图片，不能沿用外链。

**推进方式**：每个功能先做前端（页面与交互，能在浏览器里看到效果），再做后端接口与数据落库。接口契约以 `shared/` 的 zod schema 为准，前端先按契约调用，后端补齐时保持字段一致。所以同一功能的「前端 step → 后端 step」是紧邻的一对，前一步完成时页面可见但数据未落地，后一步完成后链路才通。

<br />

## 阶段 A：工程骨架与数据层　（已完成）

### Step 1　初始化 Bun workspaces　✅

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

### Step 2　数据库与 Prisma　✅

**目标**：四张业务表建好，预置账号可登录（此时还没有登录接口，只验证数据）。

**产出**

- `prisma/schema.prisma` 定义 `User`、`Resume`、`Photo`、`ResumeVersion`
- 首个 migration
- `prisma/seed.ts`：用 `Bun.password.hash()` 写入预置账号

**验证**

- `bunx prisma migrate dev` 成功，四张表出现在库中
- 执行 seed 后 `bunx prisma studio` 能看到用户记录，`password_hash` 是 argon2id 格式
- `Resume.userId` 是普通索引（非唯一约束），`Resume.title` 存在，为将来支持多份简历留出空间

<br />

### Step 3　shared 层：简历 zod schema　✅

**目标**：简历结构只定义一次，前后端与导出共用。

**产出**

- `shared/resume-schema.ts`：定义各模块与字段的 zod schema
- 导出 `ResumeData` 类型（`z.infer`）
- 导出模块元信息（模块 key、标题、是否可多条目），供编辑页动态渲染

模块顺序固定：基本信息 → 教育经历 → 专业技能 → 工作经历 → 实习经历 → 项目经历 → 页脚。字段定义见 [project-scope.md](./project-scope.md) 的「简历结构」。注意两处非对称：工作 / 实习经历的「概述」为可选字段；专业技能无编号而其余要点列表带数字编号。

**验证**

- `client` 与 `server` 都能 `import` 该 schema 且类型正确
- 故意传一个非法字段，`schema.safeParse()` 返回失败

<br />

## 阶段 B：登录与会话　（已完成）

### Step 4　前端：登录页与路由守卫　✅

**目标**：登录页可访问、样式正常，未登录访问受保护页面会被拦下。

**产出**

- Tailwind CSS 接入（`@tailwindcss/vite`）
- `tsconfig` 路径别名 `@/*` → `src/*`，Vite `resolve.alias` 同步
- `shadcn init` 并按需 add 组件
- React Router 路由：`/login`、`/edit`、`/versions`
- TanStack Query Provider
- `lib/api.ts`：统一 fetch 封装，自动带 cookie，非 2xx 抛 `ApiError`
- `lib/auth.ts`：`useCurrentUser` / `useLogin` / `useLogout`
- 登录页（shadcn + react-hook-form + zod）
- 路由守卫：`GET /api/auth/me` 未通过则跳 `/login`
- Vite `server.proxy` 把 `/api` 转发到 3000

**验证**

- 各路由都能打开，样式正常
- 未登录访问 `/edit`、`/versions` 会跳 `/login`
- 表单空提交提示必填

<br />

### Step 5　后端：鉴权接口　✅

**目标**：登录链路完整跑通。

**产出**

- `express-session` + `connect-pg-simple` 接入，`createTableIfMissing: true`、`rolling: true`、30 天有效期
- `POST /api/auth/login`：`Bun.password.verify()` 校验，登录后 `session.regenerate()` 防会话固定，再写 `req.session.userId`
- `POST /api/auth/logout`：`req.session.destroy()` + 清 cookie
- `GET /api/auth/me`：返回当前用户
- `requireAuth` 中间件

**验证**

- 登录成功后进入 `/edit`，刷新页面仍保持登录
- 密码错误提示「用户名或密码错误」，账号不存在返回同样的提示
- 登出后回到 `/login`，且无法再访问受保护页面
- `e2e/auth.spec.ts` 全部通过

<br />

## 阶段 C：简历编辑与草稿

### Step 6　样式常量表　✅

**目标**：把 Word 的排版参数抽成唯一数据源。

**产出**

- `shared/style-constants.ts`：字体族、各级字号、行距、段间距、页边距、模块间距
- 供前端 CSS 变量与后端 docx 代码共同读取
- 数值取 [tech-stack.md](./tech-stack.md) 的「样式来源」表，无需再解析 Word

**验证**

- 前端与后端均能引用，无重复定义
- 改一个值，前端预览与 docx 输出同时变化

<br />

### Step 7　前端：编辑页表单与动态条目　✅

**依赖**：Step 3 的 schema、Step 6 的样式常量。

**目标**：能完整填写简历，条目可增删拖拽。本步先用组件本地状态驱动表单，不调后端，方便先把界面调顺。

**产出**

- 按 schema 渲染各模块表单
- 可多条目模块用 `useFieldArray` 实现增删
- dnd-kit 拖拽排序，接 `useFieldArray` 的 `move()`
- 基本信息含照片上传入口（Step 10 完成前先留占位）

**验证**

- 每个模块都能新增、删除、拖拽调整条目顺序
- 必填项为空时给出校验提示
- 拖拽后表单值顺序与界面一致

<br />

### Step 8　后端：草稿读写接口　✅

**目标**：草稿能存能取。

**产出**

- `GET /api/resumes/:id`：返回该用户指定那份简历（含 `id`、`title`、`data`、`photoId`）
- `GET /api/resumes` / `POST /api/resumes` / `PATCH /api/resumes/:id` / `DELETE /api/resumes/:id`：多简历的列表、新建、重命名、删除
- `PATCH /api/resumes/:id/draft`：zod 校验后用整份 JSON 覆盖 `resumes.data`

**验证**

- `PATCH` 一个合法 JSON 后再 `GET /api/resumes/:id`，返回内容一致
- `PATCH` 一个不符合 schema 的 JSON，返回 400 且错误信息可读
- 两个不同账号的草稿互不可见
- 访问他人的 resume id 返回 404，而非返回数据
- 新建 / 重命名 / 删除简历可用；删除后其照片与版本记录级联清除

<br />

### Step 9　前端：草稿加载与自动保存　✅

**依赖**：Step 7 的表单、Step 8 的接口。

**目标**：编辑页接上后端，输入不丢。

**产出**

- 路由 `/resumes`（列表）→ `/resumes/:resumeId/edit|versions`，resume id 从 URL 取，ResumeGate 据此拉取并下发 context
- 编辑页用该 id 初始化表单
- 表单变化 debounce 1s 调 `PATCH /api/resumes/:id/draft`
- `visibilitychange` / `pagehide` 时用 `fetch(..., { keepalive: true })` 补发（sendBeacon 只能发 POST，与 PATCH 接口不符）
- 界面显示保存状态（保存中 / 已保存 / 失败）

**验证**

- 修改内容后等 1 秒，刷新页面数据仍在
- 修改内容后立刻关闭标签页，重新打开数据仍在
- 断网时显示保存失败，恢复网络后能重试成功

<br />

## 阶段 D：证件照

### Step 10　前端：照片上传与压缩　✅

**目标**：上传即压缩，避免存原图。

**产出**

- 文件选择后先用 canvas 按目标宽高比居中裁剪（cover）再缩放，转 JPEG base64（质量 0.85）
- 目标像素由显示尺寸与 300 DPI 推导（`PHOTO_PIXEL_WIDTH` / `PHOTO_PIXEL_HEIGHT` = 234×260），**不要写成标准一寸照的 295×413**：那个比例是 0.714，与 1.98:2.2 = 0.9 不符，插入后会横向拉伸
- 调 `POST /api/resumes/:id/photo`，成功后更新预览
- 展示当前照片（`GET /api/resumes/:id/photo`），支持替换

**验证**

- 上传一张大图后，请求体中的 base64 在 100 KB 量级，且解码后是 234×260 的 JPEG
- 替换照片后编辑页预览同步更新

<br />

### Step 11　后端：照片上传接口　✅

**目标**：照片单独入库，重复上传不产生新行。

**产出**

- `POST /api/resumes/:id/photo`：接收 base64，插入 `photos` 行并更新 `resumes.photo_id`
- `GET /api/resumes/:id/photo`：返回当前照片 `{ id, data }`，没有照片时 404（前端靠它展示已有照片）
- 上传前比对内容（base64 哈希）与当前照片是否相同，相同则复用现有 `photo_id`
- 照片大小上限校验（如 500 KB），超限返回 400

**验证**

- 上传一张图后 `photos` 多一行，`resumes.photo_id` 指向它
- 再上传同一张图，`photos` 行数不变
- 上传另一张图，`photos` 多一行，`photo_id` 改变，旧行仍在

<br />

## 阶段 E：版本记录

### Step 12　前端：版本管理页　✅

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

### Step 13　后端：版本接口　✅

**目标**：存档、列表、查看、恢复四个动作可用。

**产出**

- `POST /api/resumes/:id/versions`：把当前 `data` 与 `photo_id` 存入快照，可带备注
- `GET /api/resumes/:id/versions`：返回列表（时间 + 备注，不含快照本体）
- `GET /api/resumes/:id/versions/:versionId`：返回单条快照内容、`photo_id`，以及该版本当时的照片内容 `photo: { id, data } | null`（查看历史版本要显示当时的照片，一并返回省掉一次请求）
- `POST /api/resumes/:id/versions/:versionId/restore`：用快照覆盖 `resumes.data`，并把 `photo_id` 指向该版本的 `photo_id`

**验证**

- 存档 → 修改草稿 → 恢复 → 草稿回到快照内容，`photo_id` 也回到当时的值
- 恢复不产生新版本，版本数量不变
- 恢复后旧照片行仍在 `photos` 中（历史版本靠它取图）

<br />

## 阶段 F：导出与验收

### Step 14　打印预览页　❌ 已回退

**原目标**：浏览器打印出的 PDF 与目标排版一致。

**回退原因**：浏览器渲染（字体、行距、分页）无法与 Word 对齐，等于长期维护两套渲染路径，且打印出的 PDF 效果不达预期。改为只保留 docx 一条输出：导出后用本机 Word/WPS 打开预览、另存为 PDF。

**回退内容**：删除 `/preview` 路由与页面、编辑页的「打印预览」按钮、`e2e/preview.spec.ts`，以及只为预览容器准备的 `RESUME_CSS_VARS`。`ResumeReadonly` 保留，供版本记录页查看历史快照。

<br />

### Step 15　docx 导出　✅

**目标**：导出的 docx 在 Word 中打开后与目标样式一致。

**产出**

- 用 `docx` 库以代码构建文档，样式参数读常量表
- 照片按 `photo_id` 读取后以 base64 **内嵌**（原简历用的是外链，会导致收件人看不到照片，不要沿用）
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

- 走一遍完整链路：登录 → 填写 → 上传照片 → 自动保存 → 存档 → 改内容 → 恢复 → 导出 docx → 用 Word 另存 PDF
- 补齐加载态、错误提示、空状态
- 启动说明（依赖安装、数据库、迁移、seed、开发与构建命令）

**验证**

- 上述链路无中断、无报错
- 冷启动按说明操作即可跑起来
- e2e 用例覆盖全链路
- 两份文档与实现无矛盾

<br />

## 风险点

| 风险 | 影响步骤 | 应对 |
| --- | --- | --- |
| Prisma 在 Bun 下的 postinstall 被跳过 | Step 2 | 配 `trustedDependencies`，并把 `bunx prisma generate` 写进 `postinstall` |
| 前端先行导致接口契约漂移 | Step 4~13 | 契约以 `shared/` 的 zod schema 为准，两侧共用同一份定义 |
| 照片被误删导致历史版本丢图 | Step 11、13 | `photos` 只增不删，不做孤儿清理 |
| 打印样式与 docx 样式不一致 | Step 6、14、15 | 所有排版参数只从常量表读，禁止在两侧硬编码 |
| `useFieldArray` 与 dnd-kit 顺序不同步 | Step 7 | 拖拽结束时调用 `move()` 而非直接改数组 |
| 前端拿不到 resume id 就调后续接口 | Step 8、9 | 路由带 resume id，ResumeGate 据此拉取并下发 context，数据就绪后再渲染编辑页 |
| 导出的 docx 照片用外链，收件人看不到图 | Step 15 | 照片必须 base64 内嵌，不沿用原文档的 link 方式 |

<br />
