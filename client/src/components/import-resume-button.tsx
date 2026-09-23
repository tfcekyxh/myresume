import { useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import type { ResumeData } from '@mymenu/shared'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useParseResume } from '@/lib/import'
import {
  extractResumeText,
  MAX_IMPORT_TEXT_LENGTH,
  MIN_IMPORT_TEXT_LENGTH,
} from '@/lib/import-file'

type Props = {
  /** 解析结果确认后回调，由父组件整体重置表单 */
  onImport: (data: ResumeData) => void
  /** 由调用方控制按钮尺寸等外观（手机端触控区更大） */
  buttonClassName?: string
}

type Phase = 'input' | 'preview'

const MODULE_SUMMARY = [
  { key: 'education', label: '教育经历' },
  { key: 'skills', label: '专业技能' },
  { key: 'work', label: '工作经历' },
  { key: 'internship', label: '实习经历' },
  { key: 'projects', label: '项目经历' },
] as const

export function ImportResumeButton({ onImport, buttonClassName }: Props) {
  const parse = useParseResume()
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('input')
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ResumeData | null>(null)

  const trimmedLength = text.trim().length
  const textTooLong = trimmedLength > MAX_IMPORT_TEXT_LENGTH
  const canParse =
    trimmedLength >= MIN_IMPORT_TEXT_LENGTH && !textTooLong && !extracting && !parse.isPending
  const busy = extracting || parse.isPending

  function resetState() {
    setPhase('input')
    setText('')
    setFileName(null)
    setExtracting(false)
    setFileError(null)
    setParsed(null)
    parse.reset()
  }

  function handleOpenChange(next: boolean) {
    // 解析中不允许误关
    if (!next && busy) return
    if (next) resetState()
    setOpen(next)
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // 允许重复选择同一个文件
    event.target.value = ''
    if (!file) return

    setFileError(null)
    setExtracting(true)
    try {
      const extracted = await extractResumeText(file)
      setText(extracted)
      setFileName(file.name)
    } catch (error) {
      setFileName(null)
      setFileError(error instanceof Error ? error.message : '文件读取失败')
    } finally {
      setExtracting(false)
    }
  }

  async function handleParse() {
    if (!canParse) return
    setFileError(null)
    try {
      const result = await parse.mutateAsync(text.trim())
      setParsed(result.data)
      setPhase('preview')
    } catch {
      // ApiError 的文案直接在下面展示，保留文本方便用户修改后重试
    }
  }

  function handleConfirm() {
    if (!parsed) return
    onImport(parsed)
    setOpen(false)
    resetState()
    toast.success('已导入简历内容，请核对各模块字段')
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={buttonClassName}
        onClick={() => handleOpenChange(true)}
        data-testid="import-resume-button"
      >
        <Upload /> 导入简历
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          {phase === 'input' ? (
            <>
              <DialogHeader>
                <DialogTitle>导入简历</DialogTitle>
                <DialogDescription>
                  粘贴简历文本，或选择 .txt / .md / .docx / .pdf 文件自动提取文字，解析后填入当前表单。简历文本会发送给解析服务，不会被保存。
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-1.5">
                <Label htmlFor="import-resume-text">简历文本</Label>
                <Textarea
                  id="import-resume-text"
                  aria-label="简历文本"
                  className="h-56 resize-y"
                  placeholder="把简历内容粘贴到这里，或从下方选择文件自动提取"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <p
                  className={
                    textTooLong
                      ? 'text-xs text-destructive'
                      : 'text-xs text-muted-foreground'
                  }
                >
                  {trimmedLength}/{MAX_IMPORT_TEXT_LENGTH} 字
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="import-resume-file">或选择文件</Label>
                <input
                  id="import-resume-file"
                  aria-label="选择简历文件"
                  data-testid="import-resume-file"
                  type="file"
                  accept=".txt,.md,.markdown,.docx,.pdf"
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm hover:file:bg-accent"
                  onChange={(e) => void handleFileChange(e)}
                  disabled={extracting}
                />
                <div className="flex min-h-4 items-center gap-1.5 text-xs">
                  {extracting && (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span className="text-muted-foreground">正在提取文件文字…</span>
                    </>
                  )}
                  {!extracting && fileName && (
                    <span className="text-muted-foreground">
                      已提取「{fileName}」的文字，可在上方检查或修改
                    </span>
                  )}
                  {!extracting && fileError && (
                    <span className="text-destructive">{fileError}</span>
                  )}
                </div>
              </div>

              {parse.isError && (
                <p className="rounded-md bg-destructive/5 p-2 text-sm text-destructive">
                  {parse.error instanceof Error ? parse.error.message : '解析失败，请重试'}
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  取消
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleParse()}
                  disabled={!canParse}
                  data-testid="import-parse-button"
                >
                  {parse.isPending ? (
                    <>
                      <Loader2 className="animate-spin" /> 解析中，预计 10~60 秒…
                    </>
                  ) : (
                    '开始解析'
                  )}
                </Button>
              </DialogFooter>
              {trimmedLength > 0 && trimmedLength < MIN_IMPORT_TEXT_LENGTH && (
                <p className="text-xs text-muted-foreground">至少输入 {MIN_IMPORT_TEXT_LENGTH} 个字才能解析</p>
              )}
            </>
          ) : (
            parsed && (
              <>
                <DialogHeader>
                  <DialogTitle>确认导入内容</DialogTitle>
                  <DialogDescription>
                    请核对解析结果，确认后将整体覆盖当前表单的全部内容，并随草稿自动保存。
                  </DialogDescription>
                </DialogHeader>

                <dl className="space-y-1.5 rounded-lg border p-3 text-sm">
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-muted-foreground">姓名</dt>
                    <dd>{parsed.basic.name || '（未识别）'}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-muted-foreground">求职意向</dt>
                    <dd>{parsed.basic.intention || '（未识别）'}</dd>
                  </div>
                  {MODULE_SUMMARY.map(({ key, label }) => (
                    <div key={key} className="flex gap-2">
                      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
                      <dd>{parsed[key].length} 条</dd>
                    </div>
                  ))}
                </dl>

                <p className="text-sm text-muted-foreground">
                  AI 解析可能存在误差，导入后请逐条核对；证件照不会被导入改动。
                </p>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPhase('input')}
                    disabled={busy}
                  >
                    返回修改
                  </Button>
                  <Button type="button" onClick={handleConfirm} data-testid="import-confirm-button">
                    确认覆盖
                  </Button>
                </DialogFooter>
              </>
            )
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
