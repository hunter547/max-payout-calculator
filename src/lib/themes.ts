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
  /**
   * Taken from a prop firm's own site, which is why the footer names it in
   * the not-affiliated line whether or not its accounts are in the app yet.
   */
  firm?: boolean
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
    firm: true,
  },
  {
    id: 'tradeify',
    name: 'Tradeify',
    schemes: ['dark'],
    swatches: ['#08080a', '#00ff51', '#efa22b'],
    firm: true,
  },
  {
    id: 'topstep',
    name: 'Topstep',
    schemes: ['dark'],
    swatches: ['#000000', '#d5a161', '#1b2945'],
    firm: true,
  },
  {
    id: 'lucid',
    name: 'Lucid Trading',
    schemes: ['dark'],
    swatches: ['#090909', '#61f8ab', '#35435a'],
    firm: true,
  },
  {
    id: 'apex',
    name: 'Apex Trader Funding',
    schemes: ['dark'],
    swatches: ['#050927', '#0026ff', '#ffb000'],
    firm: true,
  },
]

/** The firms the app dresses itself as, whether or not it holds their accounts. */
export const FIRM_THEMES = BRAND_THEMES.filter((t) => t.firm)

export const DEFAULT_BRAND = 'default'

/** The theme for an id, falling back to the default for unknown ids. */
export function brandTheme(id: string): BrandTheme {
  return BRAND_THEMES.find((t) => t.id === id) ?? BRAND_THEMES[0]
}
