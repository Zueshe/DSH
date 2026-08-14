/**
 * Pure folds for the session-usage domain: per-session token totals and the
 * whole-report assembly. No service or storage dependency — every input is an
 * owned value so unit tests can drive the fold with fixture logs.
 *
 * Provider usage is read from `assistant/message` events exactly the way
 * `session-stats` guards them: finite non-negative numbers only, malformed
 * fields fold as zero. The billed-input convention matches `token-meter`:
 * input + cacheRead + cacheWrite, plus output, so `total` is the disjoint sum
 * of all four buckets.
 *
 * @module @deepseek-ai/dsh-session-usage/aggregate
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { UsageDayRow, UsageReport, UsageTotals, UsageTaskRow } from './types.ts'

/** Per-session fold of one log over one range. */
export interface SessionUsageFold {
  /** Durable session id. */
  sessionId: string
  /** Session creation time, Unix epoch milliseconds. */
  createdAt: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
  requests: number
  /** Local-date buckets within the fold. */
  byDay: Map<string, UsageDayRow>
}

/** Token-only portion of a fold, produced without session identity. */
export interface SessionUsageTokens {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  requests: number
  /** Local-date buckets, keyed by `YYYY-MM-DD`. */
  byDay: Map<string, UsageDayRow>
}

/** Validated input for {@link buildUsageReport}. */
export interface UsageReportAssembly {
  from: number
  to: number
  /** Per-session folds; sessions with zero requests are ignored by assembly. */
  folds: readonly SessionUsageFold[]
  /** Latest title per session id; absent ids fall back to null. */
  titles: ReadonlyMap<string, string | null>
  failedSessions: number
  scanned: number
}

const EMPTY_DAY: UsageDayRow = { date: '', input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0, total: 0 }

/**
 * Read one token-count field defensively: only finite non-negative numbers count.
 * @param value - provider-reported field.
 * @returns the count, or 0 for missing/malformed values.
 */
export function usageToken(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

/**
 * Format an event timestamp as the host-local calendar date key.
 * @param time - Unix epoch milliseconds.
 * @returns `YYYY-MM-DD` in the host's local time zone.
 */
export function dayKey(time: number): string {
  const d = new Date(time)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

/**
 * Fold one session log into token totals for the inclusive range. Only
 * `assistant/message` events carrying a usage record inside `[from, to]` count.
 * @param events - complete raw session log.
 * @param from - inclusive lower bound, Unix epoch milliseconds.
 * @param to - inclusive upper bound, Unix epoch milliseconds.
 * @returns the token totals and per-day buckets.
 */
export function foldSessionUsage(events: readonly SessionEvent[], from: number, to: number): SessionUsageTokens {
  let input = 0
  let output = 0
  let cacheRead = 0
  let cacheWrite = 0
  let requests = 0
  const byDay = new Map<string, UsageDayRow>()
  for (const event of events) {
    if (event.type !== 'assistant/message') continue
    const usage = event.data.usage
    if (usage === undefined) continue
    if (event.time < from || event.time > to) continue
    const i = usageToken(usage.inputTokens)
    const o = usageToken(usage.outputTokens)
    const cr = usageToken(usage.cacheReadTokens)
    const cw = usageToken(usage.cacheWriteTokens)
    input += i
    output += o
    cacheRead += cr
    cacheWrite += cw
    requests += 1
    const date = dayKey(event.time)
    const day = byDay.get(date) ?? { ...EMPTY_DAY, date }
    day.input += i
    day.output += o
    day.cacheRead += cr
    day.cacheWrite += cw
    day.requests += 1
    day.total += i + o + cr + cw
    byDay.set(date, day)
  }
  return { input, output, cacheRead, cacheWrite, requests, byDay }
}

/**
 * Assemble the whole-range report from per-session folds.
 * @param input - range, folds, titles, and corpus figures.
 * @returns a detached report with ascending day rows and total-descending task rows.
 */
export function buildUsageReport(input: UsageReportAssembly): UsageReport {
  const byDay = new Map<string, UsageDayRow>()
  const totals: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, requests: 0, sessions: 0 }
  for (const fold of input.folds) {
    if (fold.requests === 0) continue
    totals.sessions += 1
    totals.input += fold.input
    totals.output += fold.output
    totals.cacheRead += fold.cacheRead
    totals.cacheWrite += fold.cacheWrite
    totals.requests += fold.requests
    totals.total += fold.total
    for (const [date, day] of fold.byDay) {
      const agg = byDay.get(date) ?? { ...EMPTY_DAY, date }
      agg.input += day.input
      agg.output += day.output
      agg.cacheRead += day.cacheRead
      agg.cacheWrite += day.cacheWrite
      agg.requests += day.requests
      agg.total += day.total
      byDay.set(date, agg)
    }
  }
  const byTask: UsageTaskRow[] = input.folds
    .filter(fold => fold.requests > 0)
    .map(fold => ({
      sessionId: fold.sessionId,
      title: input.titles.get(fold.sessionId) ?? null,
      createdAt: fold.createdAt,
      input: fold.input,
      output: fold.output,
      cacheRead: fold.cacheRead,
      cacheWrite: fold.cacheWrite,
      total: fold.total,
      requests: fold.requests,
    }))
    .sort((a, b) => b.total - a.total)
  return {
    from: input.from,
    to: input.to,
    totals,
    byDay: [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    byTask,
    failedSessions: input.failedSessions,
    scanned: input.scanned,
  }
}
