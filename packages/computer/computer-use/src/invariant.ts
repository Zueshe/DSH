/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-computer-use`.
 * @module @deepseek-ai/dsh-computer-use/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-computer-use'

/** Cordis companion plugin name. */
export const name = 'computer-use-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the seam declares an abstract surface contract with no
 * registry, no selection, and no observation stream of its own; provider
 * correctness is exercised by the provider package's own tests, and the
 * consumer owns tool-level relations. Nothing here owns runtime state to
 * assert.
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
