/**
 * Process-local sample cache for repeat usage queries: one row per cold
 * persisted session, holding the compact counted-request samples and the
 * folded title under the persistence revision they were read at.
 *
 * A row is a fold shortcut, never an authority: it is served only when
 * `listSnapshots()` reports the exact revision it was stored at, so any
 * stored-log change (append, repair, external rewrite caught by the stat
 * identity) invalidates it by inequality. Live sessions never enter the cache
 * — their in-memory tail can grow without moving the persisted revision — so
 * the query re-reads them every time. The owner disposes the cache with its
 * fiber; nothing here is durable.
 *
 * @module @deepseek-ai/dsh-session-usage/cache
 */

import type { SessionPersistenceRevision } from '@deepseek-ai/dsh-session-persistence'
import type { UsageSample } from './aggregate.ts'

/** One cold session's cached fold inputs under the revision they were read at. */
export interface UsageCacheEntry {
  /** Persistence revision of the stored log the samples and title were folded from. */
  revision: SessionPersistenceRevision
  /** Counted-request samples of the complete stored log, in log order. */
  samples: readonly UsageSample[]
  /** Latest title folded from the same read; null when the log has no title event. */
  title: string | null
}

/** Revision-gated per-session cache rows owned by one host fiber. */
export class UsageSessionCache {
  private readonly entries = new Map<string, UsageCacheEntry>()

  /**
   * Read one session's row, but only at an exact revision match.
   * @param sessionId - durable session id, as a string key.
   * @param revision - the revision the persistence listing currently reports.
   * @returns the cached entry when it was stored at this exact revision, otherwise undefined.
   */
  matching(sessionId: string, revision: SessionPersistenceRevision): UsageCacheEntry | undefined {
    const entry = this.entries.get(sessionId)
    return entry !== undefined && entry.revision === revision ? entry : undefined
  }

  /**
   * Store one session's row, replacing any previous revision.
   * @param sessionId - durable session id, as a string key.
   * @param entry - samples, title, and the revision they were folded from.
   */
  store(sessionId: string, entry: UsageCacheEntry): void {
    this.entries.set(sessionId, entry)
  }

  /**
   * Drop rows for sessions absent from one corpus listing, so deleted
   * sessions do not accumulate.
   * @param keep - session ids (as string keys) the listing still reports.
   */
  prune(keep: Iterable<string>): void {
    const kept = new Set(keep)
    for (const id of this.entries.keys()) {
      if (!kept.has(id)) this.entries.delete(id)
    }
  }

  /** Clear every row; the disposing fiber calls this once. */
  dispose(): void {
    this.entries.clear()
  }
}
