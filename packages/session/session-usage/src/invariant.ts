/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-session-usage`.
 * @module @deepseek-ai/dsh-session-usage/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-session-usage'

/** Cordis companion plugin name. */
export const name = 'session-usage-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the package is a read-only aggregation over the
 * durable session corpus, so every relation it relies on is owned upstream —
 * `assistant/message` carrying the step's `usage` is emitted and validated by
 * `dsh-agent-loop`, contiguous seqs and header compatibility are enforced by
 * the session and persistence layers, and title folding is validated by
 * `dsh-session-title`. The sample cache is derived state whose freshness is
 * delegated to the persistence layer's revision tokens, so it owns no
 * relation to assert either. A failure in any of those relations surfaces as
 * a per-session read error that the query isolates and counts rather than
 * throwing.
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
