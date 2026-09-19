import { z } from 'zod'

/**
 * 简历内容的 zod schema。
 *
 * 三处复用：前端表单校验、后端 PATCH 入参校验、docx 生成时的类型来源。
 *
 * 设计取舍：本 schema 刻意保持宽松，只做结构约束与长度上限，不做邮箱、电话的格式校验。
 * 因为草稿是「输入即存」（debounce 1s 自动保存），若在此处校验格式，
 * 用户输入到一半的邮箱会导致整份草稿保存失败。格式校验放在表单层做。
 */

const shortText = z.string().max(100)
const midText = z.string().max(300)
const longText = z.string().max(1000)

/** 基本信息。证件照不在此处，它单独存 photos 表，简历行上只留 photoId。 */
export const basicSchema = z.object({
  name: z.string().max(50),
  intention: midText,
  gender: z.string().max(10),
  age: z.string().max(10),
  phone: z.string().max(30),
  email: shortText,
})

/** 教育经历。制表位排版的四段内容。 */
export const educationItemSchema = z.object({
  school: shortText,
  degree: z.string().max(50),
  major: shortText,
  period: z.string().max(50),
})

/** 专业技能。纯段落，无编号。 */
export const skillItemSchema = z.object({
  text: z.string().max(500),
})

/** 工作经历与实习经历共用。summary 为可选，原简历中两者并不一致。 */
export const experienceItemSchema = z.object({
  company: shortText,
  role: shortText,
  period: z.string().max(50),
  summary: longText.optional(),
  points: z.array(longText).max(30),
})

/** 项目经历。比工作经历多出项目类型、项目描述与技术栈。 */
export const projectItemSchema = z.object({
  name: shortText,
  /** 项目类型，如「全栈项目」「开源项目」。optional 是为了兼容加字段之前存下的草稿。 */
  type: shortText.optional(),
  period: z.string().max(50),
  description: longText,
  techStack: midText,
  points: z.array(longText).max(30),
})

export const resumeDataSchema = z.object({
  basic: basicSchema,
  education: z.array(educationItemSchema).max(10),
  skills: z.array(skillItemSchema).max(30),
  work: z.array(experienceItemSchema).max(20),
  internship: z.array(experienceItemSchema).max(20),
  projects: z.array(projectItemSchema).max(20),
  footer: midText,
})

export type ResumeData = z.infer<typeof resumeDataSchema>
export type Basic = z.infer<typeof basicSchema>
export type EducationItem = z.infer<typeof educationItemSchema>
export type SkillItem = z.infer<typeof skillItemSchema>
export type ExperienceItem = z.infer<typeof experienceItemSchema>
export type ProjectItem = z.infer<typeof projectItemSchema>

/**
 * 模块元信息，供编辑页按顺序动态渲染。
 * multiple 表示该模块是否可增删多条。
 */
export const RESUME_MODULES = [
  { key: 'basic', title: '基本信息', multiple: false },
  { key: 'education', title: '教育经历', multiple: true },
  { key: 'skills', title: '专业技能', multiple: true },
  { key: 'work', title: '工作经历', multiple: true },
  { key: 'internship', title: '实习经历', multiple: true },
  { key: 'projects', title: '项目经历', multiple: true },
  { key: 'footer', title: '页脚', multiple: false },
] as const

export type ResumeModule = (typeof RESUME_MODULES)[number]
export type ResumeModuleKey = ResumeModule['key']

/** 模块顺序。 */
export const RESUME_MODULE_ORDER: readonly ResumeModuleKey[] = RESUME_MODULES.map((m) => m.key)

/** 新建简历时的初始内容。服务端在用户还没有简历时用它创建空草稿。 */
export function createEmptyResumeData(): ResumeData {
  return {
    basic: { name: '', intention: '', gender: '', age: '', phone: '', email: '' },
    education: [],
    skills: [],
    work: [],
    internship: [],
    projects: [],
    footer: '',
  }
}
