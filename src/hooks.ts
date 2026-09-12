import { useEffect, useState } from 'react'
import { brandTheme, DEFAULT_BRAND, type Scheme } from '@/lib/themes'

function resolve<T>(initial: T | (() => T)): T {
  return typeof initial === 'function' ? (initial as () => T)() : initial
}

export function usePersistentState<T>(key: string, initial: T | (() => T)) {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key)
      if (stored !== null) return JSON.parse(stored) as T
    } catch {
      // Fall through to the default.
    }
    return resolve(initial)
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // Private browsing / quota — the app works fine without persistence.
    }
  }, [key, state])

  return [state, setState] as const
}

/**
 * The color theme and light/dark mode, applied to the root element for the
 * whole app: `data-brand` picks the theme's tokens in index.css, and the
 * `.dark` class drives shadcn/ui's dark variants.
 */
export function useAppearance() {
  const [brand, setBrand] = usePersistentState<string>('mpc.brand', DEFAULT_BRAND)
  const [preferred, setPreferred] = usePersistentState<Scheme>('mpc.theme', () =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
  )

  const theme = brandTheme(brand)
  // A single-mode theme wins over the preference, which is kept for later.
  const scheme: Scheme = theme.schemes.includes(preferred)
    ? preferred
    : theme.schemes[0]

  useEffect(() => {
    const root = document.documentElement
    root.dataset.brand = theme.id
    root.classList.toggle('dark', scheme === 'dark')
    root.style.colorScheme = scheme
    // The inline script in index.html reads this to apply the theme before
    // first paint, so it doesn't flash the default theme on load.
    try {
      window.localStorage.setItem(
        'mpc.appearance',
        JSON.stringify({ brand: theme.id, scheme }),
      )
    } catch {
      // Without storage the theme still applies once the app loads.
    }
  }, [theme.id, scheme])

  return {
    theme,
    setBrand,
    scheme,
    canToggleScheme: theme.schemes.length > 1,
    toggleScheme: () => setPreferred(scheme === 'dark' ? 'light' : 'dark'),
  }
}

export type Appearance = ReturnType<typeof useAppearance>
