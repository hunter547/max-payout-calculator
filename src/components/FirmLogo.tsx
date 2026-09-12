import { firm } from '@/lib/accounts'
import { cn } from '@/lib/utils'

interface FirmLogoProps {
  firmId: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const HEIGHT = { sm: 'h-3.5', md: 'h-5', lg: 'h-7' }

/**
 * A firm's logo, wherever its account is shown. Both logos are white-on-dark
 * art, so on a light ground they sit on a dark plate; firm themes and dark
 * mode need none.
 */
export function FirmLogo({ firmId, size = 'md', className }: FirmLogoProps) {
  const { logo } = firm(firmId)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded bg-[#0b0d14] px-1.5 py-1 dark:bg-transparent dark:p-0',
        className,
      )}
    >
      <img src={logo.src} alt={logo.alt} className={cn('block w-auto', HEIGHT[size])} />
    </span>
  )
}
