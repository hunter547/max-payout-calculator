import { useEffect, useState } from 'react'

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

export type Theme = 'light' | 'dark'

export function useTheme() {
  const [theme, setTheme] = usePersistentState<Theme>('mpc.theme', () =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
  )

  useEffect(() => {
    const root = document.documentElement
    // shadcn/ui keys its dark tokens off a `.dark` class on the root.
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme
  }, [theme])

  return [theme, setTheme] as const
}
