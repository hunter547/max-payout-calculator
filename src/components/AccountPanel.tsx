import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export type AccountKey = 'balance' | 'payoutBuffer' | 'payoutCap' | 'consistency'

const FIELDS: { key: AccountKey; label: string; unit: '$' | '%'; hint: string }[] =
  [
    {
      key: 'balance',
      label: 'Balance',
      unit: '$',
      hint: 'Current account balance.',
    },
    {
      key: 'payoutBuffer',
      label: 'Payout buffer',
      unit: '$',
      hint: 'Has to stay in the account after a withdrawal.',
    },
    {
      key: 'payoutCap',
      label: 'Payout cap',
      unit: '$',
      hint: 'Most you can take out in one request.',
    },
    {
      key: 'consistency',
      label: 'Consistency rule',
      unit: '%',
      hint: 'No single day can be more than this share of net profit.',
    },
  ]

interface AccountPanelProps {
  values: Record<AccountKey, string>
  onChange: (key: AccountKey, value: string) => void
  onReset: () => void
  consistencyInvalid: boolean
}

export function AccountPanel({
  values,
  onChange,
  onReset,
  consistencyInvalid,
}: AccountPanelProps) {
  return (
    <section aria-labelledby="account-heading">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="account-heading" className="font-expanded text-xl font-bold">
          Account
        </h2>
        <Button variant="ghost" size="sm" onClick={onReset}>
          Restore defaults
        </Button>
      </div>

      <div className="mt-4 grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {FIELDS.map((field) => {
          const id = `account-${field.key}`
          const invalid = field.key === 'consistency' && consistencyInvalid
          return (
            <div key={field.key} className="grid content-start gap-1.5">
              <Label htmlFor={id}>{field.label}</Label>
              <div className="relative">
                <span
                  aria-hidden="true"
                  className={cn(
                    'pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm text-muted-foreground',
                    field.unit === '$' ? 'left-3' : 'right-3',
                  )}
                >
                  {field.unit}
                </span>
                <Input
                  id={id}
                  inputMode="decimal"
                  autoComplete="off"
                  value={values[field.key]}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  aria-invalid={invalid || undefined}
                  aria-describedby={`${id}-hint`}
                  className={cn(
                    'font-figure',
                    field.unit === '$' ? 'pl-7' : 'pr-8',
                  )}
                />
              </div>
              <p
                id={`${id}-hint`}
                className="text-xs leading-snug text-muted-foreground"
              >
                {field.hint}
              </p>
            </div>
          )
        })}
      </div>

      {consistencyInvalid && (
        <Alert variant="destructive" className="mt-5">
          <AlertCircle />
          <AlertDescription>
            Set the consistency rule above 0%. The daily cap and the number of
            trading days both depend on it.
          </AlertDescription>
        </Alert>
      )}
    </section>
  )
}
