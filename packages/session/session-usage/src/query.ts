/**
 * Live-preferred usage collection over `ctx.sessionQuery`: enumerate the
 * corpus, fold every session's durable log, attach titles, and assemble the
 * report. Per-session read failures are isolated and counted instead of
 * failing the whole query; titles are best-effort.
 *
 * @module @deepseek-ai/dsh-session-usage/query
 */

import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionQueryEngine } from '@deepseek-ai/dsh-session-query'
import { buildUsageReport, foldSessionUsage, type SessionUsageFold } from './aggregate.ts'
import type { UsageRange, UsageReport } from './types.ts'

/** How many session logs are read concurrently. */
export const SESSION_USAGE_READ_CONCURRENCY = 6

/**
 * Read every session log once and compute the usage report for one range.
 * @param query - the mounted `sessionQuery` service.
 * @param range - inclusive timestamp bounds.
 * @returns the complete report; never throws on per-session read failures.
 */
export async function collectUsageReport(query: SessionQueryEngine, range: UsageRange): Promise<UsageReport> {
  const sessions = await query.listSessions()
  const scanned = sessions.length
  const results = new Array<SessionUsageFold | null>(scanned)
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
      try {
        const log = await query.readSession(record.header.id)
        const tokens = foldSessionUsage(log.events, range.from, range.to)
        results[index] = tokens.requests === 0 ? null : {
          sessionId: String(log.session.id),
          createdAt: log.session.createdAt,
          ...tokens,
          total: tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite,
        }
      } catch {
        results[index] = null
        failedSessions += 1
      }
    }
  }
  await Promise.all(Array.from({ length: workers }, () => worker()))

  const folds = results.filter((fold): fold is SessionUsageFold => fold !== null)
  const titles = new Map<string, string | null>()
  if (folds.length > 0) {
    try {
      const observations = await query.readTitleSnapshots(folds.map(fold => SessionId(fold.sessionId)))
      for (const observation of observations) {
        if (observation.status === 'fulfilled') {
          titles.set(String(observation.sessionId), observation.value.title === undefined ? null : observation.value.title.title)
        }
      }
    } catch {
      // Title failures must not fail the whole report.
    }
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
