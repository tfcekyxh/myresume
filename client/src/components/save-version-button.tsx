import { useState } from 'react'
import { Archive } from 'lucide-react'
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
import { useCreateVersion } from '@/lib/versions'

type Props = {
  resumeId: string
  /** 先把未落库的草稿改动发出去，否则快照可能是旧内容 */
  flushDraft: () => Promise<void>
}

export function SaveVersionButton({ resumeId, flushDraft }: Props) {
  const create = useCreateVersion(resumeId)
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')

  async function handleSave() {
    await flushDraft()
    await create.mutateAsync(note)
    setOpen(false)
    setNote('')
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Archive /> 存档
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>存档当前内容</DialogTitle>
            <DialogDescription>
              把当前草稿存成一个只读版本，之后可在「版本记录」里查看或恢复。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="version-note">备注（可选）</Label>
            <Textarea
              id="version-note"
              rows={2}
              placeholder="如：投递前端岗的版本"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={create.isPending}
            >
              取消
            </Button>
            <Button onClick={() => void handleSave()} disabled={create.isPending}>
              {create.isPending ? '存档中…' : '确认存档'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
