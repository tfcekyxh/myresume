import { useMutation } from '@tanstack/react-query'
import type { ResumeData } from '@mymenu/shared'
import { api } from './api'

/**
 * 简历导入解析。把提取出的简历文本发给服务端，由大模型转成 ResumeData。
 * 接口无状态、不落库；覆盖表单由调用方拿到结果后自行 reset。
 */
export function useParseResume() {
  return useMutation({
    mutationFn: (text: string) =>
      api<{ data: ResumeData }>('/import/parse', {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),
  })
}
