/** @vitest-environment jsdom */
// Kept in its own file: after a Radix menu closes in jsdom, the library keeps
// reading computed styles, which jsdom makes very slow, so every later test in
// the same file crawls. Edge shows no lingering work after the same menu
// closes, so this is a test-environment cost, not an app bug.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { ThemePicker } from '@/components/ThemePicker'
import { TooltipProvider } from '@/components/ui/tooltip'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??=
  ResizeObserverStub as unknown as typeof ResizeObserver

it('lists every theme and reports the one picked', () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const picked: string[] = []

  act(() =>
    root.render(
      <TooltipProvider>
        <ThemePicker value="default" onChange={(id) => picked.push(id)} />
      </TooltipProvider>,
    ),
  )

  // Radix opens the menu from the keyboard; its items render in a portal.
  const trigger = container.querySelector('button[aria-label="Color theme"]')!
  act(() => {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  const items = Array.from(
    document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
  )

  expect(items.map((el) => el.textContent)).toEqual(['Default', 'MyFundedFutures'])
  expect(items[0].getAttribute('aria-checked')).toBe('true')

  act(() => items[1].click())
  expect(picked).toEqual(['mffu'])

  act(() => root.unmount())
  container.remove()
})
