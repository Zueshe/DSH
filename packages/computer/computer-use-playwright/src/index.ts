/**
 * `@deepseek-ai/dsh-computer-use-playwright`: provides `ctx.computerUse` with
 * one shared Playwright Chromium page — lazy-launched on the first action,
 * closed with the plugin fiber. Screenshots are PNG viewport captures; every
 * action returns the post-action observation.
 *
 * @module @deepseek-ai/dsh-computer-use-playwright
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { ComputerUseError, ComputerUseService } from '@deepseek-ai/dsh-computer-use'
import type { ComputerObservation, ComputerPoint } from '@deepseek-ai/dsh-computer-use'

/** Minimal page shape the service drives; keeps Playwright types out of the seam-facing surface. */
interface PlaywrightPage {
  goto(url: string, options: { timeout?: number; waitUntil?: 'load'; signal?: AbortSignal | undefined }): Promise<unknown>
  screenshot(options: { type: 'png' }): Promise<Buffer>
  url(): string
  title(): Promise<string>
  mouse: { click(x: number, y: number): Promise<void> }
  keyboard: { type(text: string, options?: { delay?: number }): Promise<void> }
  waitForLoadState(state: 'networkidle', options: { timeout: number }): Promise<unknown>
  setDefaultNavigationTimeout(timeout: number): void
}

/** Minimal browser shape backing the shared page. */
interface PlaywrightBrowser {
  newPage(options: { viewport: { width: number; height: number } }): Promise<PlaywrightPage>
  close(): Promise<void>
}

/** Minimal `chromium` launcher shape from the dynamically imported package. */
interface PlaywrightChromium {
  launch(options: { headless: boolean }): Promise<PlaywrightBrowser>
}

/** Default bounded wait for click/type effects to settle before the screenshot. */
export const DEFAULT_SETTLE_TIMEOUT_MS = 1500

/** Provider configuration. */
export interface Config {
  /** Launch Chromium headless. Defaults to true. */
  headless?: boolean
  /** Viewport width in CSS pixels. Defaults to 1280. */
  viewportWidth?: number
  /** Viewport height in CSS pixels. Defaults to 800. */
  viewportHeight?: number
  /** Navigation timeout budget (ms). Defaults to 30000. */
  navigationTimeoutMs?: number
  /** Bounded network-idle wait after click/type before the screenshot (ms); 0 disables. Defaults to 1500. */
  settleTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  headless: z.boolean().default(true),
  viewportWidth: z.number().step(1).min(200).default(1280),
  viewportHeight: z.number().step(1).min(200).default(800),
  navigationTimeoutMs: z.number().min(1000).default(30_000),
  settleTimeoutMs: z.number().min(0).default(DEFAULT_SETTLE_TIMEOUT_MS),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/** One controllable Chromium page provided as `ctx.computerUse`. */
export class ComputerUsePlaywright extends ComputerUseService {
  static Config: z<Config> = Config

  private readonly resolved: ResolvedConfig
  private browser: Promise<PlaywrightBrowser> | undefined
  private page: Promise<PlaywrightPage> | undefined

  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.resolved = config as ResolvedConfig
    ctx.effect(() => async () => { await this.close() }, 'computerUsePlaywright.close')
  }

  /** @inheritdoc */
  override async navigate(url: string, signal?: AbortSignal): Promise<ComputerObservation> {
    signal?.throwIfAborted()
    const page = await this.ensurePage()
    try {
      await page.goto(url, { waitUntil: 'load', signal })
    } catch (error) {
      throw actionError('navigation failed', error)
    }
    return this.observe(signal)
  }

  /** @inheritdoc */
  override async observe(signal?: AbortSignal): Promise<ComputerObservation> {
    signal?.throwIfAborted()
    const page = await this.ensurePage()
    const [screenshot, title] = await Promise.all([
      page.screenshot({ type: 'png' }),
      page.title(),
    ])
    return { screenshot: new Uint8Array(screenshot), url: page.url(), title }
  }

  /** @inheritdoc */
  override async click(point: ComputerPoint, signal?: AbortSignal): Promise<ComputerObservation> {
    signal?.throwIfAborted()
    const page = await this.ensurePage()
    try {
      await page.mouse.click(point.x, point.y)
    } catch (error) {
      throw actionError('click failed', error)
    }
    await this.settle(page)
    return this.observe(signal)
  }

  /** @inheritdoc */
  override async type(text: string, signal?: AbortSignal): Promise<ComputerObservation> {
    signal?.throwIfAborted()
    const page = await this.ensurePage()
    try {
      await page.keyboard.type(text)
    } catch (error) {
      throw actionError('typing failed', error)
    }
    await this.settle(page)
    return this.observe(signal)
  }

  /**
   * Give a click or keystroke a bounded window to settle (network idle) before
   * the observation screenshots it. The budget is `settleTimeoutMs` (0 skips);
   * expiry is normal for live pages and falls through to the screenshot.
   * @param page - the shared page.
   */
  private async settle(page: PlaywrightPage): Promise<void> {
    if (this.resolved.settleTimeoutMs === 0) return
    try {
      await page.waitForLoadState('networkidle', { timeout: this.resolved.settleTimeoutMs })
    } catch {
      // Only the bounded settle wait rejects here (budget expiry or a
      // navigation that replaced the document mid-wait); the action already
      // succeeded and the screenshot below is the next step.
    }
  }

  /**
   * Resolve the shared page, launching Chromium on first use.
   * @returns the ready page.
   */
  private ensurePage(): Promise<PlaywrightPage> {
    this.page ??= this.launchBrowser().then(async (browser) => {
      const page = await browser.newPage({ viewport: { width: this.resolved.viewportWidth, height: this.resolved.viewportHeight } })
      page.setDefaultNavigationTimeout(this.resolved.navigationTimeoutMs)
      return page
    })
    return this.page
  }

  /** Dynamically import Playwright and launch Chromium. */
  private launchBrowser(): Promise<PlaywrightBrowser> {
    const launched = (async () => {
      const chromium = await importPlaywright()
      try {
        return await chromium.launch({ headless: this.resolved.headless })
      } catch (error) {
        throw launchError(error)
      }
    })()
    this.browser = launched
    launched.catch(() => {
      // A failed launch must not pin the cached promise; clear both so the
      // next action retries from a fresh import and launch.
      this.browser = undefined
      this.page = undefined
    })
    return launched
  }

  /** Close the shared page's browser, when one was launched. */
  private async close(): Promise<void> {
    const launched = this.browser
    this.browser = undefined
    this.page = undefined
    if (launched !== undefined) {
      const browser = await launched.catch(() => undefined)
      await browser?.close().catch(() => undefined)
    }
  }
}

/** Import Playwright's Chromium launcher, failing loud as a seam error. */
async function importPlaywright(): Promise<PlaywrightChromium> {
  try {
    const playwright = await import('playwright')
    return playwright.chromium
  } catch {
    throw new ComputerUseError(
      'the playwright package is not installed in this deployment',
      'COMPUTER_USE_LAUNCH_FAILED',
    )
  }
}

/** Wrap one launch failure as a seam error with the browser-install fix. */
function launchError(error: unknown): ComputerUseError {
  const detail = error instanceof Error ? error.message : String(error)
  return new ComputerUseError(
    `launching chromium failed (${detail}); run "npx playwright install chromium" once on this host`,
    'COMPUTER_USE_LAUNCH_FAILED',
  )
}

/** Wrap one action failure as a seam error. */
function actionError(what: string, error: unknown): ComputerUseError {
  const detail = error instanceof Error ? error.message : String(error)
  return new ComputerUseError(`${what}: ${detail}`, 'COMPUTER_USE_ACTION_FAILED')
}

export default ComputerUsePlaywright
