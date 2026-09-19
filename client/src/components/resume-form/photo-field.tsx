import { useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { PHOTO, PHOTO_PIXEL_HEIGHT, PHOTO_PIXEL_WIDTH } from '@mymenu/shared'
import { Button } from '@/components/ui/button'
import { useResume } from '@/components/resume-gate'
import { compressPhoto, usePhoto, useUploadPhoto } from '@/lib/photo'

/** 预览框按显示尺寸等比放大，屏幕上看不清 1.98cm 的小图。 */
const PREVIEW_WIDTH_PX = 90
const PREVIEW_HEIGHT_PX = Math.round(
  (PREVIEW_WIDTH_PX * PHOTO.displayHeightCm) / PHOTO.displayWidthCm
)

export function PhotoField() {
  const { resumeId, photoId } = useResume()
  const { data: photo, isPending } = usePhoto(resumeId, photoId)
  const upload = useUploadPhoto()

  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const previewSrc = photo ? `data:image/jpeg;base64,${photo.data}` : null

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)

    try {
      // 压缩后固定 234×260，大小有上限，不需要在前端再做体积校验——
      // 超限由后端拒绝，错误信息通过下面的 catch 展示。
      const base64 = await compressPhoto(file)
      await upload.mutateAsync({ resumeId, base64 })
    } catch (err) {
      setError(err instanceof Error ? err.message : '照片上传失败，请重试')
    }

    // 清空 input，否则连续选同一个文件不会再触发 change
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">证件照</p>

      <div className="flex items-start gap-4">
        <div
          data-testid="photo-preview"
          className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/30"
          style={{ width: PREVIEW_WIDTH_PX, height: PREVIEW_HEIGHT_PX }}
        >
          {previewSrc ? (
            <img src={previewSrc} alt="证件照" className="size-full object-cover" />
          ) : (
            <span className="text-xs text-muted-foreground">
              {photoId && isPending ? '加载中…' : '未上传'}
            </span>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            上传后自动压缩为 {PHOTO_PIXEL_WIDTH}×{PHOTO_PIXEL_HEIGHT} 的 JPEG，
            避免存原图。
          </p>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            data-testid="photo-input"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />

          <Button
            type="button"
            variant="outline"
            className="h-10 sm:h-8"
            disabled={upload.isPending}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus />
            {upload.isPending ? '上传中…' : previewSrc ? '替换照片' : '选择照片'}
          </Button>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  )
}
