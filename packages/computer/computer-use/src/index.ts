/**
 * Service Definition for the computer-use capability seam (`ctx.computerUse`):
 * one shared controllable surface — observe it, drive it to a URL, point-click
 * it, and type into it. Every action returns the complete post-action
 * {@link ComputerObservation} so the caller loop is observe → act → observe
 * without a separate read call. Providers own the surface (a browser, a
 * desktop, a sandbox); the seam carries no registry and no selection — one
 * provider per composition provides the service.
 * @module @deepseek-ai/dsh-computer-use
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { ComputerObservation, ComputerPoint } from './types.ts'

export type { ComputerObservation, ComputerPoint } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    computerUse: ComputerUseService
  }
}

/** Closed error-code taxonomy for the computer-use seam. */
export type ComputerUseErrorCode =
  | 'COMPUTER_USE_LAUNCH_FAILED'
  | 'COMPUTER_USE_ACTION_FAILED'

/** Seam error: one message plus a closed-taxonomy code. */
export class ComputerUseError extends Error {
  constructor(
    message: string,
    readonly code: ComputerUseErrorCode,
  ) {
    super(message)
    this.name = 'ComputerUseError'
  }
}

/**
 * The computer-use service. Registered as `ctx.computerUse` (one instance per
 * context). Implementations own one shared surface; actions are sequential by
 * contract because they mutate that shared state.
 */
export abstract class ComputerUseService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'computerUse')
  }

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
}

export default ComputerUseService
