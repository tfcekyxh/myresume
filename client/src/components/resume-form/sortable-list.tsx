import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from 'cn'

type SortableListProps = {
  /** 条目 id 列表，顺序即当前展示顺序，来自 useFieldArray 的 fields */
  ids: string[]
  /** 拖拽结束时回调，参数为源索引与目标索引 */
  onReorder: (from: number, to: number) => void
  children: ReactNode
}

/**
 * 可拖拽排序的条目列表。
 *
 * 拖拽结束时只把索引交给调用方，由调用方接 useFieldArray 的 move()，
 * 不直接改数组——否则表单内部顺序会与界面不一致。
 */
export function SortableList({ ids, onReorder, children }: SortableListProps) {
  const sensors = useSensors(
    // 留一点位移阈值，避免点击拖拽手柄时被误判成拖拽
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    onReorder(from, to)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

type SortableItemProps = {
  id: string
  /** 条目标题，同时用于拖拽手柄与删除按钮的无障碍标签 */
  title: string
  onRemove: () => void
  children: ReactNode
}

/** 单个可拖拽条目：统一提供拖拽手柄与删除按钮。 */
export function SortableItem({ id, title, onRemove, children }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'rounded-lg border bg-background p-3',
        isDragging && 'relative z-10 opacity-70 shadow-lg'
      )}
    >
      <div className="mb-3 flex items-center gap-1.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`拖拽排序：${title}`}
          className="cursor-grab touch-none rounded text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <span className="text-sm font-medium">{title}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          onClick={onRemove}
          aria-label={`删除：${title}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      {children}
    </div>
  )
}
