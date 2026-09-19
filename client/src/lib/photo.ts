import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PHOTO, PHOTO_PIXEL_HEIGHT, PHOTO_PIXEL_WIDTH } from '@mymenu/shared'
import { api } from './api'
import { resumeKey, type ResumeRecord } from './resume'

export type PhotoRecord = { id: string; data: string }

const photoKey = (resumeId: string, photoId: string) =>
  ['resume', resumeId, 'photo', photoId] as const

/**
 * 把用户选的文件压成证件照尺寸的 JPEG base64。
 *
 * 先按目标宽高比居中裁剪（cover）再缩放，保证不变形——
 * 直接拉伸会把任意比例的输入压变形。
 */
export async function compressPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)

  try {
    const targetRatio = PHOTO_PIXEL_WIDTH / PHOTO_PIXEL_HEIGHT
    const sourceRatio = bitmap.width / bitmap.height

    let sx = 0
    let sy = 0
    let sw = bitmap.width
    let sh = bitmap.height

    if (sourceRatio > targetRatio) {
      // 原图偏宽，裁掉左右
      sw = Math.round(bitmap.height * targetRatio)
      sx = Math.round((bitmap.width - sw) / 2)
    } else {
      // 原图偏高，裁掉上下
      sh = Math.round(bitmap.width / targetRatio)
      sy = Math.round((bitmap.height - sh) / 2)
    }

    const canvas = document.createElement('canvas')
    canvas.width = PHOTO_PIXEL_WIDTH
    canvas.height = PHOTO_PIXEL_HEIGHT

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('当前浏览器不支持 canvas，无法压缩照片')

    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, PHOTO_PIXEL_WIDTH, PHOTO_PIXEL_HEIGHT)

    const dataUrl = canvas.toDataURL('image/jpeg', PHOTO.jpegQuality)
    return dataUrl.slice(dataUrl.indexOf(',') + 1)
  } finally {
    bitmap.close()
  }
}

/** 当前照片的 base64。没有照片时不请求。 */
export function usePhoto(resumeId: string, photoId: string | null) {
  return useQuery({
    queryKey: photoKey(resumeId, photoId ?? ''),
    queryFn: () => api<PhotoRecord>(`/resumes/${resumeId}/photo`),
    enabled: photoId !== null,
    staleTime: Infinity,
  })
}

export function useUploadPhoto() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ resumeId, base64 }: { resumeId: string; base64: string }) =>
      api<{ id: string }>(`/resumes/${resumeId}/photo`, {
        method: 'POST',
        body: JSON.stringify({ data: base64 }),
      }),
    onSuccess: (photo, { resumeId, base64 }) => {
      // 把刚上传的内容直接写进缓存，省掉一次回读
      queryClient.setQueryData<PhotoRecord>(photoKey(resumeId, photo.id), {
        id: photo.id,
        data: base64,
      })
      queryClient.setQueryData<ResumeRecord>(resumeKey, (prev) =>
        prev ? { ...prev, photoId: photo.id } : prev
      )
    },
  })
}
