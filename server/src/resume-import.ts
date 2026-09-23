import { resumeDataSchema, type ResumeData } from '@mymenu/shared'
import { LLM_API_KEY, LLM_BASE_URL, LLM_MODEL } from './env'

/**
 * 简历导入：把非结构化简历文本交给 OpenAI 兼容大模型解析成 ResumeData。
 *
 * Key 只存在于服务端；模型输出先宽容归一化（补空值 / 截断 / 转型）再过 zod，
 * 模型偶发的字段瑕疵不阻断导入，实在无法使用才抛错让用户改文本重试。
 */

/** 上游服务（网络 / 非 2xx / 超时）问题。 */
export class LlmUpstreamError extends Error {}

/** 模型返回内容无法解析成合法简历。 */
export class LlmOutputError extends Error {}

const REQUEST_TIMEOUT_MS = 180_000
/** 与路由入参上限保持一致。 */
const MAX_TEXT_LENGTH = 50_000

const SYSTEM_PROMPT = `你是一个简历解析助手。用户会粘贴一段简历文本（可能来自 Word、PDF 或纯文本），你要把它解析成固定结构的 JSON。

只输出一个 JSON 对象，不要输出任何解释、前后缀或 markdown 代码块。结构如下：
{
  "basic": {
    "name": "姓名",
    "intention": "求职意向 / 目标岗位",
    "gender": "性别",
    "age": "年龄（保留原文，如 25）",
    "phone": "电话",
    "email": "邮箱"
  },
  "education": [
    { "school": "学校", "degree": "学历，如 本科 / 硕士", "major": "专业", "period": "起止时间，保留原文格式" }
  ],
  "skills": [
    { "text": "一条专业技能的完整描述" }
  ],
  "work": [
    { "company": "公司", "role": "职位", "period": "时间", "summary": "该段经历开头的整体概述，没有则空字符串", "points": ["要点1", "要点2"] }
  ],
  "internship": [
    { "company": "公司", "role": "职位", "period": "时间", "summary": "概述，没有则空字符串", "points": [] }
  ],
  "projects": [
    { "name": "项目名", "type": "项目类型，如 全栈项目 / 开源项目，没有则空字符串", "period": "时间", "description": "项目描述", "techStack": "技术栈", "points": [] }
  ],
  "footer": "页脚声明类文本，没有则空字符串"
}

规则：
1. 严格依据原文，禁止编造；识别不到的字段填空字符串，识别不到的模块填空数组。
2. 实习生 / 实习经历放 internship，正式工作放 work；在校项目 / 个人项目放 projects。
3. 每条要点放一个字符串，去掉原文的序号（1. 2. 3.）与项目符号（·、-、• 等），不要把多条合并。
4. summary 与 points 的区分（重要）：
   - 凡以项目符号（-、·、•、▪）或数字序号（1. 2. 3.、① ② ③）开头的行，一律是独立要点，必须逐条原样放进 points，绝不允许合并进 summary。
   - summary 只放该段经历中「不带任何列表符号、位于要点列表之前」的成段概述文字；没有这样的段落就填空字符串。
   - 若整段经历全是符号 / 序号开头的行，则 summary 必须为空字符串，points 包含全部行，一条都不能少。
5. 时间、专业名词、数字保留原文写法，不要翻译或改写；去除多余空白。
6. 按原文顺序输出，保持模块内条目顺序。`

/** 模型偶发在 JSON 外面包代码块或加解释，尽力抠出 JSON 本体。 */
function extractJson(content: string): unknown {
  let text = content.trim()

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    text = fence[1].trim()
  } else {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) text = text.slice(start, end + 1)
  }

  return JSON.parse(text)
}

function asString(value: unknown, max: number): string {
  const raw =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : String(value)
  // 表单字段都是单行文本，把换行 / 连续空白压成一个空格
  return raw.replace(/\s+/g, ' ').trim().slice(0, max)
}

function asPoints(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => asString(item, 1000)).filter(Boolean).slice(0, 30)
}

/** 去掉空白与常见标点，用于比较 summary 是否由 points 拼接而成。 */
function stripForCompare(s: string): string {
  return s.replace(/[\s，。；、,.；;:：！!？?（）()「」“”"'\-—·•▪*]/g, '')
}

/**
 * 模型（尤其免费小模型）常把要点列表整段抄进 summary。
 * 若 summary 去掉标点后与各 point 的拼接相同或互相包含，视为误填，清空 summary。
 * 真正的概述与具体成果文字不同，不会触发此规则。
 */
function dedupeSummary(summary: string, points: string[]): string {
  if (!summary || points.length === 0) return summary
  const s = stripForCompare(summary)
  const p = stripForCompare(points.join(''))
  if (!s || !p) return summary
  return s === p || s.includes(p) || p.includes(s) ? '' : summary
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** 宽容归一化：模型多字段 / 缺字段 / 类型偏差都在这里抹平，输出保证能过 schema。 */
function normalize(raw: unknown): ResumeData {
  const root = asRecord(raw)
  const basic = asRecord(root.basic)

  const education = (Array.isArray(root.education) ? root.education : [])
    .map((item) => {
      const r = asRecord(item)
      return {
        school: asString(r.school, 100),
        degree: asString(r.degree, 50),
        major: asString(r.major, 100),
        period: asString(r.period, 50),
      }
    })
    .filter((item) => item.school || item.major)
    .slice(0, 10)

  const skills = (Array.isArray(root.skills) ? root.skills : [])
    .map((item) => ({ text: asString(asRecord(item).text ?? item, 500) }))
    .filter((item) => item.text)
    .slice(0, 30)

  const toExperience = (item: unknown) => {
    const r = asRecord(item)
    const points = asPoints(r.points)
    const summary = dedupeSummary(asString(r.summary, 1000), points)
    return {
      company: asString(r.company, 100),
      role: asString(r.role, 100),
      period: asString(r.period, 50),
      ...(summary ? { summary } : {}),
      points,
    }
  }

  const work = (Array.isArray(root.work) ? root.work : [])
    .map(toExperience)
    .filter((item) => item.company || item.role)
    .slice(0, 20)

  const internship = (Array.isArray(root.internship) ? root.internship : [])
    .map(toExperience)
    .filter((item) => item.company || item.role)
    .slice(0, 20)

  const projects = (Array.isArray(root.projects) ? root.projects : [])
    .map((item) => {
      const r = asRecord(item)
      const type = asString(r.type, 100)
      return {
        name: asString(r.name, 100),
        ...(type ? { type } : {}),
        period: asString(r.period, 50),
        description: asString(r.description, 1000),
        techStack: asString(r.techStack, 300),
        points: asPoints(r.points),
      }
    })
    .filter((item) => item.name || item.description)
    .slice(0, 20)

  const candidate: unknown = {
    basic: {
      name: asString(basic.name, 50),
      intention: asString(basic.intention, 300),
      gender: asString(basic.gender, 10),
      age: asString(basic.age, 10),
      phone: asString(basic.phone, 30),
      email: asString(basic.email, 100),
    },
    education,
    skills,
    work,
    internship,
    projects,
    footer: asString(root.footer, 300),
  }

  const result = resumeDataSchema.safeParse(candidate)
  if (!result.success) {
    const issue = result.error.issues[0]
    const path = issue?.path.join('.') || ''
    throw new LlmOutputError(path ? `解析结果字段 ${path} 不符合要求` : '解析结果不符合简历结构')
  }
  return result.data
}

/**
 * 调大模型解析简历文本。成功返回校验过的 ResumeData；
 * 上游问题抛 LlmUpstreamError，输出不可用抛 LlmOutputError。
 */
export async function parseResumeWithLlm(text: string): Promise<ResumeData> {
  const trimmed = text.trim()

  let response: Response
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    response = await fetch(`${LLM_BASE_URL.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: trimmed.slice(0, MAX_TEXT_LENGTH) },
        ],
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new LlmUpstreamError('解析超时，请缩短简历内容后重试')
    }
    console.error('[resume-import] 调用大模型失败:', error)
    throw new LlmUpstreamError('无法连接解析服务，请稍后重试')
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error(`[resume-import] 大模型返回 ${response.status}: ${detail.slice(0, 500)}`)
    throw new LlmUpstreamError(`解析服务暂时不可用（${response.status}），请稍后重试`)
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = payload.choices?.[0]?.message?.content
  if (!content) {
    throw new LlmOutputError('解析服务没有返回内容，请修改文本后重试')
  }

  try {
    return normalize(extractJson(content))
  } catch (error) {
    if (error instanceof LlmOutputError) throw error
    console.error('[resume-import] 解析模型输出失败:', error)
    throw new LlmOutputError('解析结果不是合法的简历结构，请修改文本后重试')
  }
}
