/**
 * Aggregate token-usage report domain for the usage-statistics settings page.
 * Pure types shared by the Host fold, the HTTP route, and the browser section.
 * @module @deepseek-ai/dsh-session-usage/types
 */

/** Inclusive timestamp bounds for one usage query, Unix epoch milliseconds. */
export interface UsageRange {
  /** Inclusive lower bound, Unix epoch milliseconds. */
  from: number
  /** Inclusive upper bound, Unix epoch milliseconds. */
  to: number
}

/** Whole-range token figures across every counted session. */
export interface UsageTotals {
  /** Summed uncached input tokens. */
  input: number
  /** Summed output tokens. */
  output: number
  /** Summed provider-reported cache-read tokens. */
  cacheRead: number
  /** Summed provider-reported cache-write tokens. */
  cacheWrite: number
  /** Sum of input + output + cacheRead + cacheWrite. */
  total: number
  /** Distinct `assistant/message` events that reported usage. */
  requests: number
  /** Sessions contributing at least one request. */
  sessions: number
}

/** One local-date bucket across all counted sessions. */
export interface UsageDayRow {
  /** Local calendar date key, `YYYY-MM-DD`. */
  date: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  requests: number
  total: number
}

/** One provider-model identity with its token figures over the queried range. */
export interface UsageModelRow {
  /** Provider route that produced the counted messages. */
  provider: string
  /** Provider model id that produced the counted messages. */
  model: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
  requests: number
}

/** One session (task) with its token figures over the queried range. */
export interface UsageTaskRow {
  /** Durable session id. */
  sessionId: string
  /** Latest session title, or null when the log has no title event. */
  title: string | null
  /** Session creation time, Unix epoch milliseconds. */
  createdAt: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
  requests: number
}

/** Complete usage report for one range, serialized over the HTTP route. */
export interface UsageReport {
  from: number
  to: number
  totals: UsageTotals
  /** Local-date buckets, ascending. */
  byDay: UsageDayRow[]
  /** Provider-model identities with usage, descending by total. */
  byModel: UsageModelRow[]
  /** Sessions with usage, descending by total. */
  byTask: UsageTaskRow[]
  /** Sessions whose log read failed and were skipped. */
  failedSessions: number
  /** Sessions enumerated by the corpus. */
  scanned: number
}
