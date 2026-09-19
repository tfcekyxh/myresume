import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = {
  resumeId: string
  /** 先把未落库的草稿改动发出去，否则导出的可能是旧内容 */
  flushDraft: () => Promise<void>
  /** 由调用方控制按钮尺寸等外观（手机端触控区更大） */
  buttonClassName?: string
}

/** 请求导出 docx 并触发浏览器下载。带 loading 状态。 */
export function ExportDocxButton({ resumeId, flushDraft, buttonClassName }: Props) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setPending(true)
    setError(null)

    try {
      await flushDraft()

      const res = await fetch(`/api/resumes/${resumeId}/export/docx`, { method: 'POST' })

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? '导出失败')
      }

      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const filename = decodeURIComponent(disposition.split("filename*=UTF-8''")[1]?.split(';')[0] ?? 'resume.docx')

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败，请重试')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        className={buttonClassName}
        onClick={() => void handleExport()}
        disabled={pending}
      >
        <Download /> {pending ? '导出中…' : '导出 Word'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}