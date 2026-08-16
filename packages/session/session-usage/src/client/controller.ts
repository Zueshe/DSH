/**
 * Browser-side usage-stats data access: builds the same-origin route URL and
 * fetches the JSON report through a replaceable carrier so tests can stub it.
 * @module @deepseek-ai/dsh-session-usage/client/controller
 */

import type { UsageModelRow, UsageRange, UsageReport } from '../types.ts'

/** Replaceable fetch carrier, defaulting to the browser global. */
export type UsageFetch = (input: string | URL, init?: RequestInit) => Promise<Response>

/**
 * Wire shape of the usage route. The host process may predate the newest
 * report section, so fields the route added later read as optional here; the
 * controller defaults them instead of trusting a same-version host.
 */
type UsageReportWire = Omit<UsageReport, 'byModel'> & { byModel?: UsageModelRow[] }

/**
 * Resolve the browser's Host base with the connection carrier's null-origin fallback.
 * @returns the same-origin base URL, or the null-origin fallback when unavailable.
 */
export function hostBase(): string {
  const origin = (globalThis as { location?: { origin?: string } }).location?.origin
  return origin !== undefined && origin !== 'null' ? origin : 'http://dsh.internal'
}

/**
 * Build the same-origin usage route URL for one range.
 * @param range - inclusive timestamp bounds.
 * @param base - origin or base URL to resolve against.
 * @returns the absolute route URL with `from`/`to` query parameters.
 */
export function usageRouteUrl(range: UsageRange, base: string = hostBase()): string {
  const url = new URL('/api/session-usage', base)
  url.searchParams.set('from', String(Math.floor(range.from)))
  url.searchParams.set('to', String(Math.floor(range.to)))
  return url.toString()
}

/**
 * Owner of one usage query over the HTTP route. State-free: each `query`
 * returns a fresh report and the caller keeps its own loading/result state.
 */
export class UsageStatsController {
  /**
   * @param fetcher - HTTP carrier used to read the route (defaults to `fetch`).
   */
  constructor(private readonly fetcher: UsageFetch = (input, init) => fetch(input, init)) {}

  /**
   * Fetch the usage report for one range.
   * @param range - inclusive timestamp bounds.
   * @returns the parsed report with later-added sections defaulted, or throws on a non-2xx response.
   */
  async query(range: UsageRange): Promise<UsageReport> {
    const response = await this.fetcher(usageRouteUrl(range))
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Usage query failed: HTTP ${response.status}${detail === '' ? '' : ` ${detail}`}`)
    }
    const wire = await response.json() as UsageReportWire
    return { ...wire, byModel: wire.byModel ?? [] }
  }
}
