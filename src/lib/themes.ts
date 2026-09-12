/**
 * Color themes. Each one is a block of tokens in src/index.css, keyed on
 * `data-brand` on the root element, plus an entry here. Themes are meant to
 * follow the trader's prop firm; add a firm by adding both.
 */

export type Scheme = 'light' | 'dark'

export interface BrandTheme {
  id: string
  name: string
  /**
   * The modes the palette defines. A single-mode theme overrides the
   * trader's light/dark preference and hides the toggle.
   */
  schemes: readonly Scheme[]
  /** Page, primary, accent: shown beside the name in the theme picker. */
  swatches: readonly [string, string, string]
}

export const BRAND_THEMES: readonly BrandTheme[] = [
  {
    id: 'default',
    name: 'Default',
    schemes: ['light', 'dark'],
    swatches: ['#e9edf0', '#2f4bd8', '#177e5b'],
  },
  {
    id: 'mffu',
    name: 'MyFundedFutures',
    schemes: ['dark'],
    swatches: ['#02040e', '#3a82f7', '#d8ae5e'],
  },
]

export const DEFAULT_BRAND = 'default'

/** The theme for an id, falling back to the default for unknown ids. */
export function brandTheme(id: string): BrandTheme {
  return BRAND_THEMES.find((t) => t.id === id) ?? BRAND_THEMES[0]
}
