/**
 * Usage Statistics host plugin: exposes the session-usage aggregation as a
 * same-origin JSON route the browser settings section fetches. The route is
 * read-only and registered only when a `webServer` is mounted; the corpus
 * reads go through the existing `sessionQuery` service, with an optional
 * `sessionPersistence` backend gating a fiber-owned sample cache so repeat
 * queries skip unchanged logs.
 *
 * @module @deepseek-ai/dsh-session-usage
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { UsageSessionCache } from './cache.ts'
import { collectUsageReport } from './query.ts'
import type { UsageRange } from './types.ts'

/** Host plugin name. */
export const name = 'session-usage'

/** Required service: the web server the route registers on (activation waits for it). */
export const inject = ['webServer']

const ROUTE_PATH = '/api/session-usage'

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
  // One row store per fiber: repeat queries reuse samples of unchanged logs,
  // and disposing the plugin drops every row with it.
  const cache = new UsageSessionCache()
  ctx.effect(() => () => { cache.dispose() }, 'session-usage: sample cache')
  const route: WebRoute = {
    kind: 'exact',
    path: ROUTE_PATH,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
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
        const persistence = ctx.get('sessionPersistence')
        const report = await collectUsageReport(query, range, persistence === undefined ? { cache } : { persistence, cache })
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
