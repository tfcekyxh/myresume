import { zodResolver } from '@hookform/resolvers/zod'
import { FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form'
import { createEmptyResumeData, resumeDataSchema, type ResumeData } from '@mymenu/shared'
import {
  BasicForm,
  EducationForm,
  FooterForm,
  InternshipForm,
  ProjectsForm,
  SkillsForm,
  WorkForm,
} from './modules'

/** 递归收集校验错误，拼成「字段路径：消息」。 */
function collectMessages(errors: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(errors).flatMap(([key, value]) => {
    if (!value || typeof value !== 'object') return []
    const path = prefix ? `${prefix}.${key}` : key
    const message = (value as { message?: unknown }).message
    if (typeof message === 'string') return [`${path}：${message}`]
    return collectMessages(value as Record<string, unknown>, path)
  })
}

/**
 * 校验错误摘要。
 *
 * schema 刻意不设必填（草稿输入即存），所以这里通常不会出现；
 * 长度超限等结构性错误会在此提示，避免静默失败。
 */
function ErrorSummary() {
  const { formState } = useFormContext<ResumeData>()
  const messages = collectMessages(formState.errors)

  if (messages.length === 0) return null

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
      <p className="font-medium">有 {messages.length} 处内容不符合要求</p>
      <ul className="mt-1 list-disc pl-5">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  )
}

/** 表单数据只读展示，便于本阶段在浏览器里核对结构与条目顺序。接后端后可移除。 */
function DebugPanel() {
  const values = useWatch<ResumeData>()

  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm text-muted-foreground">表单数据（调试用）</summary>
      <pre className="mt-3 max-h-80 overflow-auto text-xs">
        {JSON.stringify(values, null, 2)}
      </pre>
    </details>
  )
}

/**
 * 简历编辑表单。
 *
 * 本阶段由组件本地状态驱动，不调后端；Step 9 再接草稿读写接口。
 * 校验直接用 shared 的 schema，保证与后端入参校验同一份定义。
 */
export function ResumeForm() {
  const form = useForm<ResumeData>({
    resolver: zodResolver(resumeDataSchema),
    defaultValues: createEmptyResumeData(),
    mode: 'onBlur',
  })

  return (
    <FormProvider {...form}>
      <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        <ErrorSummary />
        <BasicForm />
        <EducationForm />
        <SkillsForm />
        <WorkForm />
        <InternshipForm />
        <ProjectsForm />
        <FooterForm />
        <DebugPanel />
      </form>
    </FormProvider>
  )
}
