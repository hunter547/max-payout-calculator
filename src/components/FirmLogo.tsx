import { firm } from '@/lib/accounts'
import { cn } from '@/lib/utils'

interface FirmLogoProps {
  firmId: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const HEIGHT = { sm: 14, md: 20, lg: 28 }

/**
 * A firm's logo, wherever its account is shown. Both logos are white-on-dark
 * art, so on a light ground they sit on a dark plate; firm themes and dark
 * mode need none.
 */
export function FirmLogo({ firmId, size = 'md', className }: FirmLogoProps) {
  const { logo } = firm(firmId)
  // Logos are drawn at whatever aspect their firm chose, and a squat lockup
  // needs more height than a long wordmark to read at the same size.
  const height = HEIGHT[size] * (logo.scale ?? 1)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded bg-[#0b0d14] px-1.5 py-1 dark:bg-transparent dark:p-0',
        className,
      )}
    >
      <img
        src={logo.src}
        alt={logo.alt}
        style={{ height }}
        className="block w-auto"
      />
    </span>
  )
}
