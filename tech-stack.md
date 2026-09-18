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
| ORM | Prisma |
| 数据库 | PostgreSQL 16 |
| 鉴权 | express-session + connect-pg-simple（数据库 Session） |
| 密码哈希 | `Bun.password`（内置 argon2id） |
| docx 导出 | `docx` 库，代码构建 |
| PDF 导出 | 浏览器 `window.print()` + Tailwind `print:` 变体 |
| 证件照 | base64 存 `photos` 表，简历与快照只存 `photo_id` 引用，不做文件服务 |
| 工程结构 | Bun workspaces：`client/` + `server/` + `shared/` |

<br />

## 依赖清单

```
client: react react-dom react-router-dom tailwindcss
        react-hook-form zod @hookform/resolvers
        @tanstack/react-query @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
        lucide-react
        （另有 shadcn add 生成的 radix 组件）

server: express zod express-session connect-pg-simple docx @prisma/client
        -d @types/express-session @types/connect-pg-simple
        （prisma CLI 用 bunx 调用，不写进 dependencies）

shared: zod
```

被 Bun 取代、无需安装的依赖：`argon2`（用 `Bun.password`）、`dotenv`（自动加载 `.env`）、`tsx`/`ts-node`（直接跑 TS）、`nodemon`（`bun --watch`）、`vitest`（`bun test`）。

<br />

## 数据模型

```
users           id, username, password_hash, created_at
session         sid, sess, expire          -- connect-pg-simple 自动创建，无需 migration
resumes         id, user_id, data jsonb, photo_id, updated_at
photos          id, resume_id, data text, created_at   -- base64，只增不改
resume_versions id, resume_id, snapshot jsonb, photo_id, note, created_at
```

`resumes` 是用户唯一草稿，`data` 存整份简历 JSON（**不含照片**），`photo_id` 指向当前使用的照片。`photos` 是只增不改的照片池，换照片即插入新行。`resume_versions` 存只读快照，同时记录当时的 `photo_id`，因此照片也被版本控制且不重复存储。

<br />

## 关键实现约定

### 鉴权

- 账号由 seed 脚本预置，无注册流程。
- `express-session` + `connect-pg-simple`，`createTableIfMissing: true`。
- `rolling: true` 实现滑动续期，有效期 30 天；过期清理由库内置，无需定时任务。
- Cookie：`httpOnly`、`sameSite: 'lax'`、生产环境 `secure`。
- 登录写 `req.session.userId`，登出 `req.session.destroy()`，鉴权用 `requireAuth` 中间件读 `req.session.userId`。

### 草稿保存

- 草稿权威存储在服务端，前端不做持久化。
- 编辑时 debounce 1s 整体 `PATCH /resumes/draft`，提交完整 JSON，整份覆盖。
- `visibilitychange` / `pagehide` 时用 `navigator.sendBeacon` 立即补发一次，避免丢失最后一秒输入。
- 照片不走草稿接口：上传单独走 `POST /resumes/photo`，服务端插入 `photos` 行并更新 `resumes.photo_id`。若新照片与当前照片内容相同则不插入新行。

### 版本

- 点「存档」插入一条只读快照，记录当时的 `snapshot` 与 `photo_id`，可带备注。
- 「恢复到此版本」= 用快照覆盖 `resumes.data`，并把 `resumes.photo_id` 指向该版本的 `photo_id`；确认后直接覆盖，不做 diff、不生成新版本。
- `photos` 行只增不删，被历史版本引用的照片必须保留，否则历史版本会丢图。

### 样式来源

- 前端 CSS 与后端 docx 生成代码共用一份样式常量表（字体、字号、行距、页边距、模块间距）。
- 改样式只改这一处，避免两条渲染路径不一致。

### docx 导出

- 用 `docx` 库以代码构建，样式参数从共用样式常量表读取。

### PDF 导出

- 走浏览器 `window.print()`，无服务端依赖。
- 使用专用 `/preview` 路由渲染 A4 尺寸只读 DOM，**不使用组件库组件**，纯 HTML + Tailwind `print:` 变体。
- 配 `@page { size: A4; margin: ... }`，`@media print` 下隐藏导航等非内容元素。

### 证件照

- 照片以 base64 存在独立的 `photos` 表，`resumes.data` 与版本快照里都**不存照片本体**，只存 `photo_id` 引用。不做文件服务与静态资源鉴权。
- 照片因此既不随版本重复存储，又仍然受版本控制：查看历史版本时按该版本的 `photo_id` 取图，恢复版本时照片一起回到当时那张。
- 上传时前端必须先用 canvas 压缩，不存原图：缩放到目标显示尺寸（一寸照 25mm×35mm @300dpi 约 295×413 px），转 JPEG base64，控制在 100 KB 以内。
- 上传接口需比对内容（如比对 base64 哈希）与当前照片是否相同，相同则复用现有 `photo_id`，避免反复上传同一张图导致 `photos` 堆积。
- docx 生成与 `/preview` 页渲染时，照片按 `photo_id` 单独读取后并入输出。

<br />

## Bun 使用约定

```bash
bun install                  # 安装依赖
bun add <pkg>                # 添加依赖
bun add -d <pkg>             # 添加开发依赖
bun run dev                  # 运行脚本
bunx prisma generate         # 调用 CLI
bun --watch server/index.ts  # 服务端开发模式
bun run --filter '*' dev     # 跨 workspace 执行
```

- 提交 `bun.lock`，删除 `package-lock.json`。
- 需要 Bun >= 1.2。

<br />

## Prisma + Bun 注意点

Bun 默认不执行依赖的 postinstall 脚本，而 `@prisma/client` 依赖 postinstall 生成 client。若安装后报 client 未生成，两种处理方式：

1. 在 `package.json` 中声明：

```json
"trustedDependencies": ["@prisma/client", "prisma"]
```

2. 每次安装后手动执行 `bunx prisma generate`。

建议两者都做，并把 `bunx prisma generate` 写进 `postinstall` 脚本。

<br />

## 开发期注意点

Vite dev server（5173）与 Express（3000）跨源会导致 Cookie 无法携带。使用 Vite proxy 转发，让浏览器始终视为同源，避免配置 CORS 与 Cookie domain：

```ts
// vite.config.ts
server: {
  proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } }
}
```

<br />

## 未定项

- `resumes` 与 user 的关系是 1:1（单份草稿）还是 1:N（可维护多份针对不同岗位的简历）。若为 1:N 需增加简历列表页。
- 现有的 Word 简历文件尚未提供，docx 的字体、字号、行距、页边距参数待定。

<br />
