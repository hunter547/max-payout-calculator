import { firm } from '@/lib/accounts'
import { cn } from '@/lib/utils'

interface FirmIconProps {
  firmId: string
  /** Side length in pixels. */
  size?: number
  className?: string
}

/**
 * The square mark a firm goes by, for rows too tight to carry a lockup. Each
 * is the firm's own app icon, so the art brings whatever ground it has and
 * needs none from us.
 */
export function FirmIcon({ firmId, size = 20, className }: FirmIconProps) {
  const f = firm(firmId)
  return (
    <img
      src={f.icon}
      alt={`${f.name} icon`}
      width={size}
      height={size}
      className={cn('block shrink-0 rounded-[3px]', className)}
    />
  )
}
