const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const axisCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const percent = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 2,
})

const shortDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
})

const longDate = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const MINUS = '−'

export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return '—'
  // Avoid "-$0.00" for values that are zero after rounding.
  const settled = Math.abs(value) < 0.005 ? 0 : value
  return currency.format(settled)
}

/** "+$359.00" / "−$212.40" — P&L always shows its direction. */
export function formatSignedCurrency(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (Math.abs(value) < 0.005) return currency.format(0)
  const body = currency.format(Math.abs(value))
  return value > 0 ? `+${body}` : `${MINUS}${body}`
}

/** Compact tick labels: "$0", "$250", "−$100". */
export function formatAxis(value: number): string {
  if (Math.abs(value) < 1e-9) return '$0'
  return value < 0
    ? `${MINUS}${axisCurrency.format(-value)}`
    : axisCurrency.format(value)
}

export function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) return '—'
  return percent.format(fraction)
}

function parseISODate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export function formatShortDate(iso: string): string {
  const date = parseISODate(iso)
  return date ? shortDate.format(date) : 'No date'
}

export function formatLongDate(iso: string): string {
  const date = parseISODate(iso)
  return date ? longDate.format(date) : 'No date'
}
