import { useState } from 'react'
import { Check, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { FirmIcon } from '@/components/FirmIcon'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { accountTemplate, firmOf } from '@/lib/accounts'
import { accountName, type Account } from '@/lib/portfolio'
import { cn } from '@/lib/utils'

interface AccountSwitcherProps {
  accounts: Account[]
  currentId: string
  onSwitch: (id: string) => void
  onAdd: () => void
  onRename: (id: string, nickname: string) => void
  onRemove: (id: string) => void
}

/**
 * Which account the app is showing. It names each one after the account it is
 * unless the trader called it something, so keeping several needs no naming at
 * all — and renaming happens in place rather than behind a dialog.
 */
export function AccountSwitcher({
  accounts,
  currentId,
  onSwitch,
  onAdd,
  onRename,
  onRemove,
}: AccountSwitcherProps) {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')
  const current = accounts.find((a) => a.id === currentId) ?? accounts[0]
  if (!current) return null

  const name = accountName(current, accounts)

  function save() {
    onRename(current!.id, draft.trim())
    setRenaming(false)
  }

  if (renaming) {
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Input
          autoFocus
          aria-label="Account name"
          value={draft}
          placeholder={name}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setRenaming(false)}
          className="h-7 w-52 text-sm"
        />
        <Button type="submit" size="sm" variant="ghost">
          Save
        </Button>
      </form>
    )
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Switch account"
          className="-ml-2 h-7 gap-1.5 px-2 text-sm font-normal text-muted-foreground"
        >
          {name}
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        {accounts.map((account) => {
          const firm = firmOf(accountTemplate(account.setup.templateId))
          return (
            <DropdownMenuItem
              key={account.id}
              onSelect={() => onSwitch(account.id)}
              className="gap-2"
            >
              <FirmIcon firmId={firm.id} />
              <span className="min-w-0 flex-1 truncate">
                {accountName(account, accounts)}
              </span>
              <Check
                className={cn(
                  'opacity-0',
                  account.id === current.id && 'opacity-100',
                )}
              />
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onAdd}>
          <Plus />
          Add an account
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            setDraft(current.nickname)
            setRenaming(true)
          }}
        >
          <Pencil />
          Rename this one
        </DropdownMenuItem>
        {accounts.length > 1 && (
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              const ok = window.confirm(
                `Remove ${name}? Its logged days and settings go with it.`,
              )
              if (ok) onRemove(current.id)
            }}
          >
            <Trash2 />
            Remove this one
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
