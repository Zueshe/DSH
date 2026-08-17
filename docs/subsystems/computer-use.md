# Computer Use

English | [中文](computer-use.zh.md)

The computer-use seam — a [capability seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md) that spans **four operations** (navigate, observe, click, type) on one `ctx.computerUse` service, split across packages: Service Definition ([dsh-computer-use](../../packages/computer/computer-use), `ctx.computerUse` + the error taxonomy), Service Provider ([dsh-computer-use-playwright](../../packages/computer/computer-use-playwright), one lazy-launched shared Playwright Chromium page), and Consumer ([dsh-tool-computer-use](../../packages/computer/tool-computer-use), the `computer_use` tool schema). Computer use is **one optional capability**, not part of the agent-loop spine — so its vocabulary lives here, not in [core.md](core.md). A provider swap does not change how the model drives the surface.

Source: [`packages/computer/computer-use/src/types.ts`](../../packages/computer/computer-use/src/types.ts)

## Why one capability has four operations

The four operations share one surface and one observation vocabulary, but no request schema: a navigation takes a URL, a click takes viewport coordinates, typing takes keystrokes, and observation takes nothing. They are deliberately one `ctx.computerUse` middle layer because the surface is one shared mutable resource — actions are sequential by contract — and every action returns the complete post-action observation, so the model loop is observe → act → observe without a separate read call. Providers own the surface; the model-facing name, schema, prompt guidance, screenshot attachment, and presentation all live in the single `dsh-tool-computer-use` consumer.

## Observation

Every operation resolves to the same observation triple: the PNG raster of the post-action viewport, the current surface address, and the current surface title.

```ts type-equiv
/** The complete state one action or observation returns. */
interface ComputerObservation {
  /** PNG-encoded screenshot of the post-action viewport. */
  screenshot: Uint8Array
  /** Current surface address: the browser URL, or the provider's equivalent locator. */
  url: string
  /** Current surface title: the page title, or the provider's equivalent label. */
  title: string
}

```

```ts type-equiv
/** One viewport/window location in provider pixels, origin top-left. */
interface ComputerPoint {
  /** Horizontal offset from the left edge. */
  x: number
  /** Vertical offset from the top edge. */
  y: number
}
```

The consumer commits `screenshot` through the durable attachment service and returns the reference as an image block, so the bytes live outside the session log while the model-visible content stays reconstructable from it ([attachment](attachment.md)). A text-only model route cannot carry the image block; the consumer's `includeScreenshot` config stops committing images in that case, leaving the URL and title text.

## Error taxonomy

`ComputerUseError` carries one closed code: `COMPUTER_USE_LAUNCH_FAILED` (the provider could not start its surface, including a missing browser binary with the install fix in the message) or `COMPUTER_USE_ACTION_FAILED` (the provider started but one action failed). The consumer surfaces seam errors as tool errors verbatim; provider absence is a consumer-side failure stating that no provider is mounted.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcomputeruse--computeruseservice-abstract-seam"></a>

### `ctx.computerUse` — `ComputerUseService` (abstract seam)

The computer-use service. Registered as `ctx.computerUse` (one instance per context). Implementations own one shared surface; actions are sequential by contract because they mutate that shared state.

```ts cordis-catalog
/**
 * Drive the surface to an absolute address.
 * @param url - absolute URL the provider understands.
 * @param signal - optional cancellation for the navigation and observation work.
 * @returns the post-navigation observation.
 */
abstract navigate(url: string, signal?: AbortSignal): Promise<ComputerObservation>

/**
 * Observe the current surface without acting.
 * @param signal - optional cancellation for the observation work.
 * @returns the current observation.
 */
abstract observe(signal?: AbortSignal): Promise<ComputerObservation>

/**
 * Click one point on the surface.
 * @param point - viewport/window location in provider pixels.
 * @param signal - optional cancellation for the click and observation work.
 * @returns the post-click observation.
 */
abstract click(point: ComputerPoint, signal?: AbortSignal): Promise<ComputerObservation>

/**
 * Type text into the surface's current focus.
 * @param text - keystrokes to send to the focused element.
 * @param signal - optional cancellation for the typing and observation work.
 * @returns the post-typing observation.
 */
abstract type(text: string, signal?: AbortSignal): Promise<ComputerObservation>
```

Source: [`packages/computer/computer-use/src/index.ts:44`](../../packages/computer/computer-use/src/index.ts)
<!-- END GENERATED cordis-surface -->
