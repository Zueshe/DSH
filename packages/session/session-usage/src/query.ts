/**
 * Live-preferred usage collection over `ctx.sessionQuery`: enumerate the
 * corpus, fold every session's counted requests, attach titles, and assemble
 * the report. Per-session read failures are isolated and counted instead of
 * failing the whole query; titles are best-effort.
 *
 * Repeat queries skip unchanged logs: with a `sessionPersistence` backend and
 * a caller-owned {@link UsageSessionCache}, each cold session is read at most
 * once per stored-log revision — `listSnapshots()` change tokens gate every
 * cache row, and the query refolds any range over the cached samples. Live
 * sessions always re-read (their in-memory tail can outgrow the persisted
 * revision), and a missing backend or cache leaves every session reading per
 * query. Titles fold in the same pass the samples come from, so one query
 * never reads a log twice.
 *
 * @module @deepseek-ai/dsh-session-usage/query
 */

import type SessionPersistence from '@deepseek-ai/dsh-session-persistence'
import type { SessionPersistenceRevision } from '@deepseek-ai/dsh-session-persistence'
import type { SessionQueryEngine } from '@deepseek-ai/dsh-session-query'
import { foldSessionTitle } from '@deepseek-ai/dsh-session-title'
import { buildUsageReport, extractUsageSamples, foldSessionSamples, type SessionUsageFold, type UsageSample } from './aggregate.ts'
import type { UsageSessionCache } from './cache.ts'
import type { UsageRange, UsageReport } from './types.ts'

/** How many session logs are read concurrently. */
export const SESSION_USAGE_READ_CONCURRENCY = 6

/** Optional caching inputs: the change-token backend and the caller-owned row store. */
export interface UsageCacheOptions {
  /** Persistence backend listing cheap per-log revisions; absent disables caching. */
  persistence?: SessionPersistence
  /** Cache owned by the caller's fiber; absent reads every session per query. */
  cache?: UsageSessionCache
}

/** One session's fold inputs resolved by a worker: samples plus the same-read title. */
interface CollectedSession {
  samples: readonly UsageSample[]
  title: string | null
}

/**
 * List the persistence revisions one query should gate cache rows on.
 * @param persistence - backend listing snapshots, or undefined to skip gating.
 * @returns revisions keyed by session id string, or undefined when unavailable.
 */
async function listRevisions(persistence: SessionPersistence | undefined): Promise<Map<string, SessionPersistenceRevision> | undefined> {
  if (persistence === undefined) return undefined
  try {
    const snapshots = await persistence.listSnapshots()
    const revisions = new Map<string, SessionPersistenceRevision>()
    for (const snapshot of snapshots) {
      revisions.set(String(snapshot.header.id), snapshot.revision)
    }
    return revisions
  } catch {
    // Snapshot failures must not fail the report; this query just reads cold.
    return undefined
  }
}

/**
 * Read every session log once per stored-log revision and compute the usage
 * report for one range.
 * @param query - the mounted `sessionQuery` service.
 * @param range - inclusive timestamp bounds.
 * @param options - persistence backend and cache enabling unchanged-log reuse.
 * @returns the complete report; never throws on per-session read failures.
 */
export async function collectUsageReport(
  query: SessionQueryEngine,
  range: UsageRange,
  options: UsageCacheOptions = {},
): Promise<UsageReport> {
  const sessions = await query.listSessions()
  const scanned = sessions.length
  const revisions = options.cache === undefined ? undefined : await listRevisions(options.persistence)
  const collected = new Array<CollectedSession | null>(scanned).fill(null)
  let failedSessions = 0
  let cursor = 0
  const workers = Math.min(SESSION_USAGE_READ_CONCURRENCY, scanned)
  async function worker(): Promise<void> {
    while (cursor < scanned) {
      const index = cursor
      cursor += 1
      // oxlint-disable-next-line typescript/no-non-null-assertion -- the cursor stays inside the listed array
      const record = sessions[index]!
      // A session created after the range end has no events inside it.
      if (record.header.createdAt > range.to) continue
      const id = String(record.header.id)
      // Live sessions always re-read: the in-memory tail can outgrow the
      // persisted revision a cache row would be gated on.
      const revision = record.live || revisions === undefined ? undefined : revisions.get(id)
      const cached = revision === undefined ? undefined : options.cache?.matching(id, revision)
      if (cached !== undefined) {
        collected[index] = { samples: cached.samples, title: cached.title }
        continue
      }
      try {
        const log = await query.readSession(record.header.id)
        const samples = extractUsageSamples(log.events)
        const title = foldSessionTitle(log.events)?.title ?? null
        if (!record.live && revision !== undefined && options.cache !== undefined) {
          options.cache.store(id, { revision, samples, title })
        }
        collected[index] = { samples, title }
      } catch {
        collected[index] = null
        failedSessions += 1
      }
    }
  }
  await Promise.all(Array.from({ length: workers }, () => worker()))

  options.cache?.prune(sessions.map(record => String(record.header.id)))

  const folds: SessionUsageFold[] = []
  const titles = new Map<string, string | null>()
  for (let index = 0; index < scanned; index += 1) {
    const session = collected[index]
    // Skipped and failed sessions leave explicit nulls; the index stays inside the array.
    if (session === null || session === undefined) continue
    const tokens = foldSessionSamples(session.samples, range.from, range.to)
    if (tokens.requests === 0) continue
    // oxlint-disable-next-line typescript/no-non-null-assertion -- the index stays inside the listed array
    const record = sessions[index]!
    const sessionId = String(record.header.id)
    folds.push({
      sessionId,
      createdAt: record.header.createdAt,
      ...tokens,
      total: tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite,
    })
    titles.set(sessionId, session.title)
  }

  return buildUsageReport({
    from: range.from,
    to: range.to,
    folds,
    titles,
    failedSessions,
    scanned,
  })
}
