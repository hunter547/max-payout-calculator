import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  accountLabel,
  accountTemplate,
  firm,
  FIRMS,
  programsFor,
  sizesFor,
} from '@/lib/accounts'
import { cn } from '@/lib/utils'

interface AccountPickerProps {
  value: string
  onChange: (templateId: string) => void
  disabled?: boolean
  className?: string
}

export function AccountPicker({
  value,
  onChange,
  disabled = false,
  className,
}: AccountPickerProps) {
  const current = accountTemplate(value)

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          aria-label="Funded account"
          className={cn('justify-between gap-3 font-normal', className)}
        >
          {/* The firm's logo sits above, so the label is the account itself. */}
          <span className="truncate">{accountLabel(current)}</span>
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuRadioGroup value={current.id} onValueChange={onChange}>
          {/* A group per account type, so the sizes read as its sizes. */}
          {FIRMS.flatMap((f) => programsFor(f.id)).map((p, i) => (
            <div key={p.id}>
              {i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>
                {firm(p.firmId).name} {p.name}
              </DropdownMenuLabel>
              {sizesFor(p.id).map((t) => (
                <DropdownMenuRadioItem key={t.id} value={t.id}>
                  {t.name}
                </DropdownMenuRadioItem>
              ))}
            </div>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
