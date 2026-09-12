import { Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { BRAND_THEMES } from '@/lib/themes'

interface ThemePickerProps {
  value: string
  onChange: (id: string) => void
}

export function ThemePicker({ value, onChange }: ThemePickerProps) {
  return (
    // Non-modal: a two-item menu doesn't need to lock scrolling or hide the
    // page from assistive tech while it's open.
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Color theme">
              <Palette />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Color theme</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Color theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {BRAND_THEMES.map((theme) => (
            <DropdownMenuRadioItem key={theme.id} value={theme.id}>
              <span aria-hidden="true" className="flex -space-x-1">
                {theme.swatches.map((color, i) => (
                  <span
                    key={i}
                    // The outline keeps a swatch that matches the menu visible.
                    className="size-3.5 rounded-full border border-foreground/20 ring-2 ring-popover"
                    style={{ background: color }}
                  />
                ))}
              </span>
              {theme.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
