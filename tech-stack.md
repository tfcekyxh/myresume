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
| PDF 导出 | 不做服务端转换：导出 docx 后用本机 Word/WPS 打开、另存为 PDF |
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

server: express zod express-session connect-pg-simple docx
        @prisma/client @prisma/adapter-pg
        -d prisma dotenv @types/express-session @types/connect-pg-simple

shared: zod
```

被 Bun 取代、无需安装的依赖：`argon2`（用 `Bun.password`）、`tsx`/`ts-node`（直接跑 TS）、`nodemon`（`bun --watch`）、`vitest`（`bun test`）。

注意 `dotenv` **仍然需要**：Bun 运行时能自动加载 `.env`，但 Prisma CLI 不能，必须在 `prisma.config.ts` 里显式加载。

已实测的版本：Bun 1.4.2、React 19.2.8、Vite 8.3.0、TypeScript 6.0.2、Express 5.1.0、Prisma 7.10.0。

<br />

## 数据模型

```
users           id, username, password_hash, created_at
session         sid, sess, expire          -- connect-pg-simple 自动创建，无需 migration
resumes         id, user_id, title, data jsonb, photo_id, updated_at
photos          id, resume_id, data text, created_at   -- base64，只增不改
resume_versions id, resume_id, snapshot jsonb, photo_id, note, created_at
```

关系为 `user 1:N resume 1:N resume_version`，`resume 1:N photo`（照片池）。

**多份简历，已完整支持**：`resume.user_id` 是普通索引而非唯一约束，一个人可以有多份简历（前端 / 后端 / 全栈各一份），每份各有草稿、证件照与版本记录。登录后先进 `/resumes` 列表页选一份，再进入该份的编辑 / 版本 / 预览页；接口路径带 resume id，URL 即身份（可刷新、可分享）。

`data` 存整份简历 JSON（**不含照片**），`photo_id` 指向当前使用的照片。`photos` 是只增不改的照片池，换照片即插入新行。`resume_versions` 存只读快照，同时记录当时的 `photo_id`，因此照片也被版本控制且不重复存储。

<br />

## 接口一览

```
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
```

路径一律带 resume id，多份简历各自独立。

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
- 编辑时 debounce 1s 整体 `PATCH /api/resumes/:id/draft`，提交完整 JSON，整份覆盖。
- `visibilitychange`（hidden）/ `pagehide` 时用 `fetch(..., { keepalive: true })` 立即补发一次，避免丢失最后一秒输入。不用 `navigator.sendBeacon`，因为它只能发 POST，而草稿接口是 PATCH。
- 照片不走草稿接口：上传单独走 `POST /api/resumes/:id/photo`，服务端插入 `photos` 行并更新 `resumes.photo_id`。若新照片与当前照片内容相同则不插入新行。

### 版本

- 草稿（`resumes.data`）是唯一的工作区，编辑时自动保存覆盖它；版本是**只读快照**，只在点「存档」时产生。
- 点「存档」插入一条版本，记录当时的 `snapshot` 与 `photo_id`，可带备注。产生后内容不再改变，因此随时可以安全回滚。
- 「恢复到此版本」= 用快照覆盖 `resumes.data` 与 `resumes.photo_id`；确认后直接覆盖，不做 diff、不新增记录。
- 版本列表顶部固定显示一条「当前草稿（未存档）」，内容随编辑实时更新；它只可查看，不提供恢复（它本身就是当前内容）。
- `photos` 行只增不删，被历史版本引用的照片必须保留，否则历史版本会丢图。

### 样式来源

前端 CSS 与后端 docx 生成代码共用一份样式常量表（`shared/style-constants.ts`），改样式只改这一处，避免两条渲染路径不一致。

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

### PDF 导出

- 不做服务端转换。浏览器渲染与 Word 排版无法对齐，因此不维护第二套渲染路径。
- 流程：导出 docx → 用本机 Word / WPS 打开预览 → 另存为 PDF。
- 若要改成服务端转换，需要 Dockerfile 装 LibreOffice（镜像 +600MB、转换吃 300MB 内存）并补齐中文字体，否则字体被静默替换，行宽与分页都会变。

### 证件照

- 照片以 base64 存在独立的 `photos` 表，`resumes.data` 与版本快照里都**不存照片本体**，只存 `photo_id` 引用。不做文件服务与静态资源鉴权。
- 照片因此既不随版本重复存储，又仍然受版本控制：查看历史版本时按该版本的 `photo_id` 取图，恢复版本时照片一起回到当时那张。
- 上传时前端必须先用 canvas 压缩，不存原图：按目标宽高比**居中裁剪（cover）**再缩放（不要直接拉伸，任意比例的输入会变形），转 JPEG base64，控制在 100 KB 以内。目标像素由显示尺寸与 300 DPI 推导（1.98 × 2.2 cm → 234 × 260），**不要用标准一寸照的 295×413**，那个比例 0.714 与 1.98:2.2 = 0.9 不符，插入后会横向拉伸。
- 上传接口需比对内容（如比对 base64 哈希）与当前照片是否相同，相同则复用现有 `photo_id`，避免反复上传同一张图导致 `photos` 堆积。
- docx 生成时，照片按 `photo_id` 单独读取后并入输出。

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

## Prisma 7 配置方式

Prisma 7 与 6 的配置模型差别很大，以下为实际采用的方式。

**1. 连接串不在 schema 里**

`schema.prisma` 的 datasource 只保留 provider，写 `url` 会直接报错：

```prisma
datasource db {
  provider = "postgresql"
}
```

**2. 连接串移到 `prisma.config.ts`**

CLI（migrate / db push / studio）从配置文件读取。注意 Prisma CLI 不自动加载 `.env`，需显式引入 dotenv：

```ts
import path from 'node:path'
import { config } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

config({ path: path.join(import.meta.dirname, '.env') })

export default defineConfig({
  schema: path.join(import.meta.dirname, 'prisma', 'schema.prisma'),
  datasource: { url: env('DATABASE_URL') },
  migrations: {
    path: path.join(import.meta.dirname, 'prisma', 'migrations'),
    seed: 'bun prisma/seed.ts',
  },
})
```

**3. 运行时必须显式传驱动适配器**

PrismaClient 不再自己读 `DATABASE_URL`，否则运行时报错：

```ts
import { PrismaClient } from './generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
export const prisma = new PrismaClient({ adapter })
```

因此额外依赖 `@prisma/adapter-pg`。

**4. 版本必须对齐**

CLI 与 client 版本不一致会出问题。当前锁定 `prisma@7.10.0` 与 `@prisma/client@7.10.0`（`bun add prisma` 默认会拉 8.0.0-rc 预发布版，需显式指定版本）。

<br />

## 环境变量

`.env` 放在 `server/`，因为只有服务端需要它。客户端若需环境变量，用 Vite 自己的 `.env` 与 `VITE_` 前缀。

- Bun 运行时从 cwd（`server/`）自动加载 `.env`
- Prisma CLI 由 `prisma.config.ts` 中的 dotenv 显式加载
- `.env` 已被 `.gitignore` 覆盖，`.env.example` 提交进仓库

<br />

## Prisma + Bun 注意点

**Prisma Client 生成到源码目录**（`schema.prisma` 的 generator 设置 `output = "../src/generated/prisma"`），不放到默认的 `node_modules/.prisma`：

- 默认位置依赖 `@prisma/client` 的 postinstall 生成；Bun 默认不执行依赖的 postinstall（靠根 `package.json` 的 `trustedDependencies` 才跑），且部署平台的 install 阶段往往只放 `package.json` 与锁文件、拿不到 schema，运行时就会报 `Cannot find module '.prisma/client/default'`。
- 生成到源码目录则产物随代码一起进镜像，不依赖 postinstall 时机、也不怕 `node_modules` 被重建。

由此的引用方式：

- 业务代码从生成目录导入：`import { PrismaClient } from './generated/prisma'`（见 `server/src/db.ts`、`server/prisma/seed.ts`、`e2e/db.ts`）。
- 生成目录 `server/src/generated/` 已加入 `.gitignore`；它由 `db:generate` 产出，构建时先跑它再构建。
- 生成代码运行时会 require `@prisma/client-runtime-utils`（Bun 隔离安装不会把它提升到顶层），因此要在 `server/package.json` 显式声明该依赖。

Bun 采用隔离安装，依赖装在各自 workspace 的 `node_modules`，因此 Prisma 命令要在 `server/` 目录下执行（或用根目录的 `db:*` 脚本转发）。

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
