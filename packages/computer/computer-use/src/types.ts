/**
 * Pure-type outlet of the computer-use capability: neutral observation and
 * pointer vocabulary shared by the Service Definition, providers, and the
 * model-facing tool.
 * @module @deepseek-ai/dsh-computer-use/types
 */

/** One viewport/window location in provider pixels, origin top-left. */
export interface ComputerPoint {
  /** Horizontal offset from the left edge. */
  x: number
  /** Vertical offset from the top edge. */
  y: number
}

/** The complete state one action or observation returns. */
export interface ComputerObservation {
  /** PNG-encoded screenshot of the post-action viewport. */
  screenshot: Uint8Array
  /** Current surface address: the browser URL, or the provider's equivalent locator. */
  url: string
  /** Current surface title: the page title, or the provider's equivalent label. */
  title: string
}
