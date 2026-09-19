import { useId, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from 'cn'

type FieldShellProps = {
  label: string
  htmlFor: string
  error?: string
  className?: string
  children: ReactNode
}

function FieldShell({ label, htmlFor, error, className, children }: FieldShellProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

type TextFieldProps = React.ComponentProps<'input'> & {
  label: string
  error?: string
  /** 整个字段（含 label）的外层 class，内层 Input 用 inputClassName */
  className?: string
  inputClassName?: string
}

export function TextField({
  label,
  error,
  className,
  inputClassName,
  ...props
}: TextFieldProps) {
  const id = useId()
  return (
    <FieldShell label={label} htmlFor={id} error={error} className={className}>
      <Input
        {...props}
        id={id}
        className={inputClassName}
        aria-invalid={error ? true : undefined}
      />
    </FieldShell>
  )
}

type TextAreaFieldProps = React.ComponentProps<'textarea'> & {
  label: string
  error?: string
  className?: string
  textareaClassName?: string
}

export function TextAreaField({
  label,
  error,
  className,
  textareaClassName,
  ...props
}: TextAreaFieldProps) {
  const id = useId()
  return (
    <FieldShell label={label} htmlFor={id} error={error} className={className}>
      <Textarea
        {...props}
        id={id}
        className={textareaClassName}
        aria-invalid={error ? true : undefined}
      />
    </FieldShell>
  )
}
