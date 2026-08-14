/**
 * Client controller: builds the same-origin usage route URL and fetches the
 * JSON report, surfacing non-2xx responses as typed errors.
 */

import { describe, expect, it } from 'vitest'
import { hostBase, usageRouteUrl, UsageStatsController } from '../src/client/controller.ts'
import type { UsageReport } from '../src/types.ts'

describe('usageRouteUrl', () => {
  it('builds the route URL with floored from/to parameters', () => {
    const url = usageRouteUrl({ from: 1.9, to: 2.4 }, 'http://host')
    const parsed = new URL(url)
    expect(parsed.pathname).toBe('/api/session-usage')
    expect(parsed.searchParams.get('from')).toBe('1')
    expect(parsed.searchParams.get('to')).toBe('2')
  })
  it('falls back to the null-origin host base', () => {
    expect(hostBase()).toBe('http://dsh.internal')
    expect(usageRouteUrl({ from: 0, to: 1 }).startsWith('http://dsh.internal/api/session-usage')).toBe(true)
  })
})

describe('UsageStatsController', () => {
  it('returns the parsed report on a 2xx response', async () => {
    const report: UsageReport = {
      from: 0, to: 1,
      totals: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, total: 3, requests: 1, sessions: 1 },
      byDay: [], byTask: [], failedSessions: 0, scanned: 1,
    }
    const fetcher = async () => new Response(JSON.stringify(report), { status: 200 })
    const controller = new UsageStatsController(fetcher)
    await expect(controller.query({ from: 0, to: 1 })).resolves.toEqual(report)
  })
  it('throws with the HTTP status on a non-2xx response', async () => {
    const fetcher = async () => new Response('boom', { status: 503 })
    const controller = new UsageStatsController(fetcher)
    await expect(controller.query({ from: 0, to: 1 })).rejects.toThrow('HTTP 503 boom')
  })
})
