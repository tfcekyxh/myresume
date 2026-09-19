import { useFormContext, useWatch } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import type { ResumeData } from '@mymenu/shared'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type PointsFieldProps = {
  /**
   * 数组路径，如 `work.0.points`。
   *
   * RHF 的路径类型推导不到嵌套数组，这里按 string 传入并在内部断言；
   * 也正因如此改用受控组件手动维护增删，不走 useFieldArray。
   * 要点条目短、数量少，不需要拖拽。
   */
  name: string
  label?: string
}

/** 要点列表：字符串数组，可增删。 */
export function PointsField({ name, label = '要点' }: PointsFieldProps) {
  const { control, setValue } = useFormContext<ResumeData>()
  const points = (useWatch({ control, name: name as never }) ?? []) as string[]

  function update(next: string[]) {
    setValue(name as never, next as never, { shouldDirty: true })
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>

      {points.length === 0 ? (
        <p className="text-xs text-muted-foreground">暂无{label}，点下方按钮添加</p>
      ) : (
        <div className="space-y-2">
          {points.map((value, index) => (
            <div key={index} className="flex items-start gap-2">
              <span className="mt-2 w-4 shrink-0 text-right text-xs text-muted-foreground">
                {index + 1}.
              </span>
              <Textarea
                rows={2}
                placeholder="描述一条内容"
                value={value}
                onChange={(e) => {
                  const next = [...points]
                  next[index] = e.target.value
                  update(next)
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`删除${label} ${index + 1}`}
                onClick={() => update(points.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={() => update([...points, ''])}>
        <Plus /> 添加{label}
      </Button>
    </div>
  )
}
