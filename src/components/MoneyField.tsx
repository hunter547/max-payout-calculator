import type { ReactNode, Ref } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** A dollar prefix, or a percent, days or payouts suffix. */
export type FieldUnit = '$' | '%' | 'days' | 'payouts'

interface MoneyFieldProps {
  id: string
  label: ReactNode
  value: string
  onChange: (value: string) => void
  hint?: ReactNode
  error?: string | null
  invalid?: boolean
  unit?: FieldUnit
  size?: 'default' | 'lg'
  /** Keep the label for screen readers when a heading already asks the question. */
  hideLabel?: boolean
  disabled?: boolean
  inputRef?: Ref<HTMLInputElement>
  onEnter?: () => void
}

export function MoneyField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  invalid = false,
  unit = '$',
  size = 'default',
  hideLabel = false,
  disabled = false,
  inputRef,
  onEnter,
}: MoneyFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  const lg = size === 'lg'
  const prefix = unit === '$'

  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id} className={cn(hideLabel && 'sr-only')}>
        {label}
      </Label>
      {/* Dim the whole control from here, so the unit fades with the value. */}
      <div className={cn('relative', disabled && 'cursor-not-allowed opacity-50')}>
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground',
            lg ? 'text-2xl' : 'text-sm',
            prefix ? (lg ? 'left-4' : 'left-3') : lg ? 'right-4' : 'right-3',
          )}
        >
          {unit}
        </span>
        <Input
          id={id}
          ref={inputRef}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onEnter) {
              e.preventDefault()
              onEnter()
            }
          }}
          aria-invalid={invalid || error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            // The wrapper does the dimming; opacity here would double it.
            'font-figure disabled:bg-muted disabled:opacity-100',
            lg && 'h-16 text-3xl font-semibold md:text-3xl',
            prefix && (lg ? 'pl-10' : 'pl-7'),
            unit === '%' && (lg ? 'pr-12' : 'pr-8'),
            unit === 'days' && (lg ? 'pr-20' : 'pr-14'),
            unit === 'payouts' && (lg ? 'pr-28' : 'pr-20'),
          )}
        />
      </div>
      {hint && (
        <p id={hintId} className="text-xs leading-snug text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
