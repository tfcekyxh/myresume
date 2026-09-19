import { createEmptyResumeData, resumeDataSchema } from '@mymenu/shared'
import { prisma } from './db'

/**
 * 按 id 取当前用户的简历。
 *
 * 带上 userId 条件，别人的 resume id 一律当作不存在——各路由都走这里，
 * 避免某处漏了归属校验。
 */
export function findOwnResume(resumeId: string, userId: string) {
  return prisma.resume.findFirst({ where: { id: resumeId, userId } })
}

/**
 * 读库里的简历 JSON 并解析。
 *
 * 库里理论上都是通过 schema 校验写入的，但 schema 会演进、数据也可能被手工改过，
 * 解析失败时退回空草稿，避免把坏数据抛给前端。
 */
export function parseResumeData(raw: unknown) {
  const parsed = resumeDataSchema.safeParse(raw)
  return parsed.success ? parsed.data : createEmptyResumeData()
}
