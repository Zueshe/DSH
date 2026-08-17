/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-computer-use-playwright`.
 * @module @deepseek-ai/dsh-computer-use-playwright/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-computer-use-playwright'

/** Cordis companion plugin name. */
export const name = 'computer-use-playwright-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the provider holds one private page whose lifetime is
 * owned by the fiber effect that closes it on dispose; per-action behavior is
 * covered by the provider's own tests and every failure surfaces as a typed
 * seam error on the call that caused it, so there is no independent runtime
 * relation to assert here.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
