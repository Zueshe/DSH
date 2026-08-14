/**
 * Usage Statistics host plugin: exposes the session-usage aggregation as a
 * same-origin JSON route the browser settings section fetches. The route is
 * read-only and registered only when a `webServer` is mounted; the corpus
 * reads go through the existing `sessionQuery` service.
 *
 * @module @deepseek-ai/dsh-session-usage
 */

import { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { collectUsageReport } from './query.ts'
import type { UsageRange } from './types.ts'

/** Host plugin name. */
export const name = 'session-usage'

/** Required service: the web server the route registers on (activation waits for it). */
export const inject = ['webServer']

const ROUTE_PATH = '/api/session-usage'

/** Minimal URL reader the route handler needs from the node request. */
interface UsageRequest { url?: string }

/** Minimal response writer the route handler needs from the node response. */
interface UsageResponse {
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string): void
}

/**
 * Parse a bounded `from`/`to` range from a request URL.
 * @param url - request URL carrying the query parameters.
 * @returns the validated range, or undefined when missing or invalid.
 */
export function parseUsageRange(url: URL): UsageRange | undefined {
  const fromRaw = url.searchParams.get('from')
  const toRaw = url.searchParams.get('to')
  if (fromRaw === null || toRaw === null || fromRaw === '' || toRaw === '') return undefined
  const from = Number(fromRaw)
  const to = Number(toRaw)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return undefined
  if (from < 0 || to < from) return undefined
  return { from, to }
}

/**
 * Register the usage JSON route on the mounted web server.
 * @param ctx - Host context carrying the injected `webServer` and `sessionQuery`.
 */
export function apply(ctx: Context): void {
  const route: WebRoute = {
    kind: 'exact',
    path: ROUTE_PATH,
    handler: async (req: UsageRequest, res: UsageResponse) => {
      const range = parseUsageRange(new URL(req.url ?? '/', 'http://dsh.local'))
      if (range === undefined) {
        res.writeHead(400, { 'content-type': 'text/plain' })
        res.end('usage query requires finite from <= to query parameters')
        return
      }
      const query = ctx.get('sessionQuery')
      if (query === undefined) {
        res.writeHead(503, { 'content-type': 'text/plain' })
        res.end('sessionQuery service is unavailable')
        return
      }
      try {
        const report = await collectUsageReport(query, range)
        res.writeHead(200, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        })
        res.end(JSON.stringify(report))
      } catch (error) {
        ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
        res.writeHead(500, { 'content-type': 'text/plain' })
        res.end('usage query failed')
      }
    },
  }
  ctx.effect(() => ctx.webServer.register(route), 'session-usage: route')
}
