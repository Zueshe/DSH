/**
 * Pure folds for the session-usage domain: per-request sample extraction,
 * per-session token totals over one range, and the whole-report assembly. No
 * service or storage dependency — every input is an owned value so unit tests
 * can drive the fold with fixture logs.
 *
 * Provider usage is read from `assistant/message` events exactly the way
 * `session-stats` guards them: finite non-negative numbers only, malformed
 * fields fold as zero. The billed-input convention matches `token-meter`:
 * input + cacheRead + cacheWrite, plus output, so `total` is the disjoint sum
 * of all four buckets.
 *
 * The fold is two stages on purpose: {@link extractUsageSamples} reduces a
 * log to the compact per-request facts (timestamp, identity, four token
 * counts) that a repeat query can cache per session, and
 * {@link foldSessionSamples} refolds any `[from, to]` range over those
 * samples exactly — samples carry millisecond timestamps, so a cached session
 * never changes range semantics.
 *
 * @module @deepseek-ai/dsh-session-usage/aggregate
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { UsageDayRow, UsageModelRow, UsageReport, UsageTotals, UsageTaskRow } from './types.ts'

/** Identity read from one counted event's message source; `'unknown'` marks unreadable fields. */
export interface UsageModelIdentity {
  provider: string
  model: string
}

/** One counted request: everything the range fold needs, nothing else from the log. */
export interface UsageSample {
  /** Event timestamp, Unix epoch milliseconds. */
  time: number
  /** Provider route that produced the message; `'unknown'` when unreadable. */
  provider: string
  /** Provider model id that produced the message; `'unknown'` when unreadable. */
  model: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

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
  /** Provider-model buckets within the fold, keyed by `provider/model`. */
  byModel: Map<string, UsageModelRow>
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
  /** Provider-model buckets, keyed by `provider/model`. */
  byModel: Map<string, UsageModelRow>
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

const EMPTY_MODEL: Omit<UsageModelRow, 'provider' | 'model'> = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0, total: 0 }

const UNKNOWN_MODEL = 'unknown'

/** Map key separating two providers that serve the same model id. */
function modelKey(identity: UsageModelIdentity): string {
  return `${identity.provider}/${identity.model}`
}

/**
 * Read one counted event's provider/model identity defensively from its
 * assistant message source: only string fields count.
 * @param source - `AssistantMessage.source` of a counted event.
 * @returns the identity; unreadable fields read as `'unknown'`.
 */
export function usageModelIdentity(source: unknown): UsageModelIdentity {
  const fields = source as { provider?: unknown; model?: unknown } | null | undefined
  return {
    provider: typeof fields?.provider === 'string' ? fields.provider : UNKNOWN_MODEL,
    model: typeof fields?.model === 'string' ? fields.model : UNKNOWN_MODEL,
  }
}

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
 * Reduce one session log to its counted-request samples. Exactly
 * `assistant/message` events carrying a usage record produce a sample — even
 * one whose four fields all fold as zero still counts as a request.
 * @param events - complete raw session log.
 * @returns one sample per counted event, in log order.
 */
export function extractUsageSamples(events: readonly SessionEvent[]): UsageSample[] {
  const samples: UsageSample[] = []
  for (const event of events) {
    if (event.type !== 'assistant/message') continue
    const usage = event.data.usage
    if (usage === undefined) continue
    const identity = usageModelIdentity(event.data.message.source)
    samples.push({
      time: event.time,
      provider: identity.provider,
      model: identity.model,
      input: usageToken(usage.inputTokens),
      output: usageToken(usage.outputTokens),
      cacheRead: usageToken(usage.cacheReadTokens),
      cacheWrite: usageToken(usage.cacheWriteTokens),
    })
  }
  return samples
}

/**
 * Fold one session's samples into token totals for the inclusive range: only
 * samples whose timestamp lands inside `[from, to]` count.
 * @param samples - one session's counted requests (from {@link extractUsageSamples} or a cache row).
 * @param from - inclusive lower bound, Unix epoch milliseconds.
 * @param to - inclusive upper bound, Unix epoch milliseconds.
 * @returns the token totals, per-day buckets, and per-model buckets.
 */
export function foldSessionSamples(samples: readonly UsageSample[], from: number, to: number): SessionUsageTokens {
  let input = 0
  let output = 0
  let cacheRead = 0
  let cacheWrite = 0
  let requests = 0
  const byDay = new Map<string, UsageDayRow>()
  const byModel = new Map<string, UsageModelRow>()
  for (const sample of samples) {
    if (sample.time < from || sample.time > to) continue
    const i = sample.input
    const o = sample.output
    const cr = sample.cacheRead
    const cw = sample.cacheWrite
    input += i
    output += o
    cacheRead += cr
    cacheWrite += cw
    requests += 1
    const date = dayKey(sample.time)
    const day = byDay.get(date) ?? { ...EMPTY_DAY, date }
    day.input += i
    day.output += o
    day.cacheRead += cr
    day.cacheWrite += cw
    day.requests += 1
    day.total += i + o + cr + cw
    byDay.set(date, day)
    const identity: UsageModelIdentity = { provider: sample.provider, model: sample.model }
    const key = modelKey(identity)
    const modelRow = byModel.get(key) ?? { ...EMPTY_MODEL, ...identity }
    modelRow.input += i
    modelRow.output += o
    modelRow.cacheRead += cr
    modelRow.cacheWrite += cw
    modelRow.requests += 1
    modelRow.total += i + o + cr + cw
    byModel.set(key, modelRow)
  }
  return { input, output, cacheRead, cacheWrite, requests, byDay, byModel }
}

/**
 * Assemble the whole-range report from per-session folds.
 * @param input - range, folds, titles, and corpus figures.
 * @returns a detached report with ascending day rows and total-descending model and task rows.
 */
export function buildUsageReport(input: UsageReportAssembly): UsageReport {
  const byDay = new Map<string, UsageDayRow>()
  const byModel = new Map<string, UsageModelRow>()
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
    for (const [key, row] of fold.byModel) {
      const agg = byModel.get(key) ?? { ...EMPTY_MODEL, provider: row.provider, model: row.model }
      agg.input += row.input
      agg.output += row.output
      agg.cacheRead += row.cacheRead
      agg.cacheWrite += row.cacheWrite
      agg.requests += row.requests
      agg.total += row.total
      byModel.set(key, agg)
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
    byModel: [...byModel.values()].sort((a, b) => b.total - a.total),
    byTask,
    failedSessions: input.failedSessions,
    scanned: input.scanned,
  }
}
