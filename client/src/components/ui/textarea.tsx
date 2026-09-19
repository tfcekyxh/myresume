import * as React from "react"
import { cn } from "cn"

/**
 * 自增高文本框：内容多高就撑多高，手机上不需要在框内滚动。
 *
 * 不用 CSS 的 field-sizing: content——微信内置浏览器、旧版 iOS Safari 不支持，
 * 会退化成固定 rows 高度，内容一多就出现框内滚动条。这里统一用 JS 量 scrollHeight，
 * 现代与老旧浏览器行为一致；高度上限由 max-height 控制，超出才允许内部滚动。
 */
function Textarea({ className, onInput, ref, ...props }: React.ComponentProps<"textarea">) {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null)

  const resize = React.useCallback(() => {
    const el = innerRef.current
    if (!el) return
    // 先归零再量，否则删字时高度只增不减
    el.style.height = "auto"
    // 全局 box-sizing: border-box，style.height 含上下边框而 scrollHeight 不含，
    // 直接取 scrollHeight 会矮 2px，永远残留一点内部滚动，故补上边框高度
    const { borderTopWidth, borderBottomWidth } = getComputedStyle(el)
    const border =
      Number.parseFloat(borderTopWidth) + Number.parseFloat(borderBottomWidth)
    el.style.height = `${el.scrollHeight + border}px`
  }, [])

  // register() 的 ref 要透传给 RHF，不能独占
  const setRef = React.useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) (ref as React.RefObject<HTMLTextAreaElement | null>).current = node
    },
    [ref]
  )

  // 每次渲染都校正一次：程序性赋值（版本回滚、调试面板应用 JSON）不触发 input 事件
  React.useLayoutEffect(resize)

  return (
    <textarea
      data-slot="textarea"
      ref={setRef}
      className={cn(
        "flex max-h-[60vh] min-h-16 w-full resize-none overflow-y-auto rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      onInput={(event) => {
        onInput?.(event)
        resize()
      }}
      {...props}
    />
  )
}

export { Textarea }
