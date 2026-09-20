# PDF 导出实施方案

定稿日期：2026-09-20

配套文档：[project-scope.md](./project-scope.md)（需求与行为）、[tech-stack.md](./tech-stack.md)（选型与实现约定）、[impl-plan.md](./impl-plan.md)（分步实施计划）

<br />

## 背景：为什么最终走 PDFKit

原本的 PDF 方案是「导出 docx → 用本机 Word/WPS 另存为 PDF」（见 `impl-plan.md` Step 14 的回退记录）。实际使用中发现两个问题：

1. **Mac 版 Word 无法可靠使用 docx 内嵌字体**。为了让导出的 docx 在任何机器上都显示一致，试过把思源黑体嵌入 docx，做了完整排查：

   | 排查项 | 结果 |
   | --- | --- |
   | fontTable 条目、`embedRegular` + `embedBold` | ✅ 正确 |
   | 关系类型、Content_Types 声明 | ✅ 正确 |
   | 字体 family 名与 `w:name` 一致 | ✅ 已修正（变量字体默认实例是 Thin，会带歪名字） |
   | `w:sig` 字体签名 | ✅ 已修正为真实值（docx 库硬编码的签名不声明中文码页，会让 Word 判定字体不支持中文） |
   | cmap 完整性、字形轮廓、步进宽度 | ✅ 正常 |
   | 无变量字体残留表 | ✅ 只剩合法的 `STAT` |
   | 完整字体（12MB）与子集字体（51KB）对比测试 | ❌ **两者在 Word 中均回退** |

   OOXML 结构逐项验证无误，但 Word for Mac 仍对同一段落内的字符做不一致替换。结论是 Mac 版 Word 的嵌入字体处理不可靠（官方文档也注明 Word 2019 for Mac 不支持嵌入字体）。**该路径放弃，docx 导出维持现状（用本机字体探测，见 `tech-stack.md`）。**

2. **依赖本机 Word 意味着 PDF 质量取决于用户环境**，无法作为稳定的交付路径。

因此改为**服务端直接生成 PDF**，字体嵌入由我们完全掌控。

<br />

## 选型对比

| 方案 | 结论 |
| --- | --- |
| LibreOffice 无头转换 | ❌ 镜像 +400MB、Railway 需装 apt 包、冷启动慢；且仍依赖 docx 中间产物 |
| 浏览器打印（`window.print`） | ❌ 已试过并回退（`impl-plan.md` Step 14）：浏览器渲染的字体、行距、分页无法与 Word 对齐，等于长期维护两套渲染路径 |
| **PDFKit 直接生成** | ✅ **采用**。纯 JS 依赖、体积小、字体嵌入 100% 可控 |

代价：`server/docx.ts` 的排版逻辑需要在 PDFKit 里再实现一份。缓解办法是**两边都只读 `shared/style-constants.ts`**，不硬编码任何数值（与现有约定一致）。

<br />

## 已验证的技术前提

以下为实测结果，不是推测：

| 验证项 | 结果 |
| --- | --- |
| 中文字体嵌入 | `FontFile2` 流 + `CIDFontType2` + `Identity-H` 编码 |
| 自动子集化 | 10.1MB 源字体 → **12.5KB** PDF，只嵌入用到的字形 |
| 中英数混排渲染 | 正确，无缺字、无回退（已渲染成图核对） |
| 文本可复制 / 可搜索 | 存在 `ToUnicode` 映射 |
| 依赖性质 | 纯 JS，无原生二进制，Bun 下直接可用 |

**关键点：源字体体积与 PDF 体积无关。** PDFKit 输出时会按实际用字裁剪，所以仓库里放全量字体不会让导出的 PDF 变大。

<br />

## 字体资源

- **字体**：Noto Sans SC（思源黑体），SIL OFL 许可，可自由分发与嵌入。
- **字重**：需要 Regular(400) 与 Bold(700) 两个**静态**字重。PDFKit 不支持变量字体，也不做伪粗体，粗体必须显式切换字体。
- **来源**：Google Fonts 的变量字体 `NotoSansSC[wght].ttf`，用 fontTools 实例化成静态字重（一次性，见下方脚本）。

**必须注意的坑**：变量字体的默认实例是 **Thin(100)**。若实例化时不重建 `name` 表，字体 family 名会变成 `Noto Sans SC Thin`，与文档里声明的字体名对不上。必须显式重写 nameID 1/2/3/4/6，并同步 `OS/2.usWeightClass`、`OS/2.fsSelection`、`head.macStyle`。

```python
# 一次性执行，产出静态字重；产物提交进仓库，构建流程不依赖 Python
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FAMILY = 'Noto Sans SC'
SRC = 'NotoSansSC[wght].ttf'

def build(weight, style, out):
    font = TTFont(SRC)
    instancer.instantiateVariableFont(font, {'wght': weight}, inplace=True, updateFontNames=False)
    full = FAMILY if style == 'Regular' else f'{FAMILY} {style}'
    font['name'].names = []
    for pid, eid, lid in [(3, 1, 0x409), (1, 0, 0)]:
        font['name'].setName(FAMILY, 1, pid, eid, lid)
        font['name'].setName(style, 2, pid, eid, lid)
        font['name'].setName(f'{FAMILY};{style};1.0', 3, pid, eid, lid)
        font['name'].setName(full, 4, pid, eid, lid)
        font['name'].setName(f'NotoSansSC-{style}', 6, pid, eid, lid)
    os2 = font['OS/2']
    os2.usWeightClass = weight
    os2.fsSelection = (os2.fsSelection & ~0x40) | 0x20 if style == 'Bold' else (os2.fsSelection & ~0x20) | 0x40
    font['head'].macStyle = 1 if style == 'Bold' else 0
    font.save(out)

build(400, 'Regular', 'NotoSansSC-Regular.ttf')
build(700, 'Bold', 'NotoSansSC-Bold.ttf')
```

**存放位置**：`server/assets/fonts/`，与 `OFL.txt` 一起提交。

**体积取舍**：

| 方案 | 仓库体积 | 说明 |
| --- | --- | --- |
| 全量静态字重（**采用**） | 约 20MB | 覆盖所有汉字，生僻姓名也不会缺字；不影响 PDF 体积 |
| 预子集到 GB2312 | 约 4MB | 省 16MB，但 GB2312 不含 `玥 喆 垚 璟 翀` 等现代常见名用字，姓名可能渲染成方框 |

**采用全量**：姓名是简历里最不能出错的地方，而仓库体积不影响运行时与产出物，不值得为 16MB 冒缺字风险。

<br />

## 版式映射（docx → PDFKit）

数值一律从 `shared/style-constants.ts` 读取，两侧禁止硬编码。

| 版式要素 | docx 实现 | PDFKit 实现 |
| --- | --- | --- |
| 纸张 / 页边距 | `page.size` / `page.margin`（twips） | `size: 'A4'`，`margins` 用 `cmToPt()` 换算 |
| 正文行距 | `spacing.line`（240 × 1.1） | `lineGap`，或按 `fontSize × 1.1` 手动推进 y |
| 章节标题 | 文字底纹（白字）+ 段落下边框 | `rect().fill()` 画黑底 + 白字；`moveTo/lineTo/stroke` 画 0.5pt 下边框 |
| 条目标题行 | 制表位 `pos=2000/2800` + 右对齐时间 | 按 `ITEM_TITLE.columnStartsCm` 算绝对 x 定位；时间用 `align: 'right'` |
| 时间文字颜色 | `color: COLOR.timeText` | `fillColor()` |
| 要点编号 | `numbering` 十进制，每段独立实例 | 手动拼 `1.` 前缀（PDFKit 的 `list()` 无法按条目重置） |
| 要点缩进 | `indent.left` + `hanging` | `doc.text(..., { indent, x })` |
| 证件照 | `ImageRun` base64 内嵌 | `doc.image(buffer, x, y, { width, height })` |
| 页脚 | `footerDistance` | 定位到距底边 `PAGE.footerDistanceCm` |
| 分页 | 由 Word 自动分页 | PDFKit 对流动文本自动分页 |

<br />

## 实施步骤

### Step 17　字体资源准备

**产出**

- 按上节脚本产出 `NotoSansSC-Regular.ttf` / `NotoSansSC-Bold.ttf`
- 落到 `server/assets/fonts/`，附 `OFL.txt`
- 校验：用 fontTools 读回，确认 family 名为 `Noto Sans SC`、字重 400/700、`cmap` 与 `glyf` 完整

**验证**

- 两个文件能被 PDFKit 注册并渲染出正确的中英数混排（渲染成图核对）

<br />

### Step 18　后端：PDF 生成

**依赖**：Step 17 的字体、Step 6 的样式常量。

**产出**

- `server/src/pdf.ts`：镜像 `server/src/docx.ts` 的结构，逐模块产出 PDFKit 绘制指令
- 字体在模块加载时注册一次，不每次请求都读文件
- 复用现有取数与校验：`findOwnResume` / `parseResumeData` / 照片按 `photo_id` 读取
- `POST /api/resumes/:id/export/pdf` 返回文件流，文件名含姓名与日期（与 docx 接口保持一致）
- 页面尺寸、页边距、字号、行距、缩进、颜色全部取自 `shared/style-constants.ts`

**验证**

- 导出多页简历，分页位置合理、无内容截断
- 中文、英文、数字均正常，粗体标题真实加粗
- 证件照位置与尺寸与 docx 版一致
- 用 PDF 阅读器打开，确认字体已嵌入（换一台没装思源黑体的机器也能正常显示）

<br />

### Step 19　前端：导出 PDF 按钮

**依赖**：Step 18 的接口。

**产出**

- 编辑页在「导出 Word」旁新增「导出 PDF」，样式与现有按钮一致
- 复用 `ExportDocxButton` 的逻辑（先 `flushDraft()` 再请求，避免导出旧内容），抽成共用组件或参数化
- 带 loading 与错误提示

**验证**

- 点击后触发下载，文件名正确
- 未落库的改动会被先保存再导出
- 手机上按钮不溢出

<br />

### Step 20　e2e 测试

**产出**

- `e2e/export-pdf.spec.ts`，按现有约定：只写端到端、一个用例讲一件事
- 断言：触发下载、文件以 `%PDF` 开头、体积合理
- 断言：PDF 内含嵌入字体流（`FontFile2`）且 `BaseFont` 含 `NotoSansSC`
- 复用 `e2e/export-docx.spec.ts` 的辅助函数写法

**验证**

- `bun run test:e2e` 全绿

<br />

## 风险点

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 排版逻辑变成两份（docx / PDF） | 长期不一致 | 两侧只读 `shared/style-constants.ts`，禁止硬编码；改版式时同步检查两处 |
| 变量字体实例化后 name 表带 Thin 后缀 | 字体匹配失败 | Step 17 显式重建 name 表并校验 family 名 |
| 分页行为与 docx 不一致 | 多页简历断点不同 | 以 PDF 为准（它才是交付物）；必要时对章节加保护性换行 |
| 仓库体积 +20MB | 克隆与部署变慢 | 已确认不影响 PDF 体积；若后续在意，可换成 GB2312 预子集并接受生僻姓名风险 |
| 字体许可 | 分发合规 | 使用 OFL 许可的 Noto Sans SC，随包附 `OFL.txt` |

<br />

## 与现有约定的关系

- **docx 导出保留**，不替换。用户仍可导出 docx 自行编辑。
- **不做浏览器打印预览**的约定继续有效（PDF 由服务端生成，不是浏览器渲染）。
- `shared/style-constants.ts` 的使用范围从「前端 CSS + 后端 docx」扩展为「前端 CSS + 后端 docx + 后端 PDF」，它仍是唯一的排版数据源。
