/**
 * 简历模块顺序，前后端与导出共用。
 * Step 3 会在此基础上补齐各模块的字段 zod schema。
 */
export const RESUME_MODULE_ORDER = [
  'basic',
  'education',
  'skills',
  'work',
  'internship',
  'projects',
  'footer',
] as const

export type ResumeModuleKey = (typeof RESUME_MODULE_ORDER)[number]
