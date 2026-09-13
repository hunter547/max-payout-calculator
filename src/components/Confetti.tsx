import { useEffect } from 'react'

/**
 * A short burst, for the one moment in the app worth celebrating. The library
 * is loaded on demand so it stays out of the main bundle, drawn in the theme's
 * own colors, and skipped entirely for anyone who asked for less motion.
 */
export function Confetti() {
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    let cancelled = false
    void import('canvas-confetti')
      .then(({ default: confetti }) => {
        if (cancelled) return
        const style = getComputedStyle(document.documentElement)
        const colors = ['--primary', '--profit', '--cap']
          .map((token) => style.getPropertyValue(token).trim())
          .filter(Boolean)

        const burst = (origin: { x: number; y: number }, delay: number) =>
          window.setTimeout(() => {
            if (cancelled) return
            try {
              confetti({
                particleCount: 70,
                spread: 68,
                startVelocity: 42,
                origin,
                colors: colors.length ? colors : undefined,
                disableForReducedMotion: true,
              })
            } catch {
              // No canvas to draw on (jsdom, or a locked-down browser).
            }
          }, delay)

        const timers = [
          burst({ x: 0.5, y: 0.35 }, 0),
          burst({ x: 0.2, y: 0.45 }, 180),
          burst({ x: 0.8, y: 0.45 }, 320),
        ]
        cleanup = () => timers.forEach(window.clearTimeout)
      })
      .catch(() => {
        // The burst is decoration; the screen works without it.
      })

    let cleanup = () => {}
    return () => {
      cancelled = true
      cleanup()
    }
  }, [])

  return null
}
