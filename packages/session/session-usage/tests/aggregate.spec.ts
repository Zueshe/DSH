/**
 * Pure fold: `assistant/message` usage inside the range becomes per-session
 * token totals, local-date buckets, and provider-model buckets; out-of-range,
 * usage-less, and non-message events are ignored; malformed usage fields fold
 * as zero and unreadable model identities fold as unknown; the report
 * assembly sums across sessions and sorts day, model, and task rows.
 */

import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  buildUsageReport, dayKey, foldSessionUsage, usageModelIdentity, usageToken,
  type SessionUsageFold,
} from '../src/aggregate.ts'

const FROM = new Date(2026, 7, 14, 0, 0, 0).getTime()
const TO = new Date(2026, 7, 14, 23, 59, 59).getTime()

/** A usage record shaped like the provider-reported TokenUsage subset. */
interface UsageRecord {
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/** `source` defaults to a mock model identity; pass `null` to leave it absent. */
function usageEvent(time: number, usage?: UsageRecord, source?: unknown): SessionEvent {
  return {
    type: 'assistant/message',
    seq: 0,
    time,
    data: { turn: 0, step: 0, message: { role: 'assistant', content: [], source: source === undefined ? { kind: 'model', provider: 'mock', model: 'mock' } : source }, usage },
    surfaceOp: 'append',
    sourceEventSeqs: [],
  } as unknown as SessionEvent
}

function dayEvent(time: number, usage: UsageRecord): SessionEvent {
  return usageEvent(time, usage)
}

function fold(...events: SessionEvent[]): SessionUsageFold {
  const tokens = foldSessionUsage(events, FROM, TO)
  return {
    sessionId: 's',
    createdAt: FROM,
    ...tokens,
    total: tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite,
  }
}

describe('usageToken', () => {
  it('accepts finite non-negative numbers', () => {
    expect(usageToken(3)).toBe(3)
    expect(usageToken(0)).toBe(0)
  })
  it('folds malformed and missing values as zero', () => {
    expect(usageToken(-1)).toBe(0)
    expect(usageToken(Number.NaN)).toBe(0)
    expect(usageToken(Number.POSITIVE_INFINITY)).toBe(0)
    expect(usageToken(undefined)).toBe(0)
    expect(usageToken('4')).toBe(0)
  })
})

describe('dayKey', () => {
  it('formats a local calendar date key', () => {
    expect(dayKey(new Date(2026, 7, 14, 10, 30).getTime())).toBe('2026-08-14')
  })
})

describe('usageModelIdentity', () => {
  it('reads string provider and model fields', () => {
    expect(usageModelIdentity({ kind: 'model', provider: 'deepseek', model: 'deepseek-chat' }))
      .toEqual({ provider: 'deepseek', model: 'deepseek-chat' })
  })
  it('folds missing, null, and non-string fields as unknown', () => {
    expect(usageModelIdentity(undefined)).toEqual({ provider: 'unknown', model: 'unknown' })
    expect(usageModelIdentity(null)).toEqual({ provider: 'unknown', model: 'unknown' })
    expect(usageModelIdentity({ kind: 'model' })).toEqual({ provider: 'unknown', model: 'unknown' })
    expect(usageModelIdentity({ provider: 7, model: true })).toEqual({ provider: 'unknown', model: 'unknown' })
  })
})

describe('foldSessionUsage', () => {
  it('folds zero on an empty log', () => {
    const f = fold()
    expect(f.requests).toBe(0)
    expect(f.total).toBe(0)
    expect(f.byDay.size).toBe(0)
    expect(f.byModel.size).toBe(0)
  })
  it('sums disjoint usage buckets and buckets by local date', () => {
    const f = fold(
      dayEvent(FROM + 1000, { inputTokens: 10, outputTokens: 4, cacheReadTokens: 2, cacheWriteTokens: 1 }),
      dayEvent(FROM + 2000, { inputTokens: 3, outputTokens: 1 }),
    )
    expect(f.requests).toBe(2)
    expect(f.input).toBe(13)
    expect(f.output).toBe(5)
    expect(f.cacheRead).toBe(2)
    expect(f.cacheWrite).toBe(1)
    expect(f.total).toBe(21)
    const day = f.byDay.get('2026-08-14')
    expect(day?.total).toBe(21)
    expect(day?.requests).toBe(2)
  })
  it('ignores events outside the range', () => {
    const f = fold(
      dayEvent(FROM - 1000, { inputTokens: 99, outputTokens: 1 }),
      dayEvent(TO + 1000, { inputTokens: 99, outputTokens: 1 }),
    )
    expect(f.requests).toBe(0)
    expect(f.total).toBe(0)
  })
  it('ignores usage-less assistant messages and non-message events', () => {
    const noUsage = usageEvent(FROM + 1000)
    const toolResult = { type: 'tool/result', seq: 1, time: FROM + 500, data: { turn: 0, step: 0, message: { source: { kind: 'tool', callId: 'c', name: 'x' }, content: [] } } } as unknown as SessionEvent
    const f = fold(noUsage, toolResult)
    expect(f.requests).toBe(0)
    expect(f.total).toBe(0)
  })
  it('folds malformed usage fields as zero', () => {
    const f = fold(dayEvent(FROM + 1000, { inputTokens: Number.NaN, outputTokens: -2 }))
    expect(f.requests).toBe(1)
    expect(f.total).toBe(0)
  })
  it('buckets usage by provider-model identity and separates same-model providers', () => {
    const f = fold(
      usageEvent(FROM + 1000, { inputTokens: 10, outputTokens: 4 }, { kind: 'model', provider: 'deepseek', model: 'deepseek-chat' }),
      usageEvent(FROM + 2000, { inputTokens: 6, outputTokens: 2 }, { kind: 'model', provider: 'deepseek', model: 'deepseek-reasoner' }),
      usageEvent(FROM + 3000, { inputTokens: 5, outputTokens: 1 }, { kind: 'model', provider: 'openai', model: 'deepseek-chat' }),
    )
    const chat = f.byModel.get('deepseek/deepseek-chat')
    expect(chat).toMatchObject({ provider: 'deepseek', model: 'deepseek-chat', input: 10, output: 4, total: 14, requests: 1 })
    expect(f.byModel.get('deepseek/deepseek-reasoner')).toMatchObject({ total: 8, requests: 1 })
    expect(f.byModel.get('openai/deepseek-chat')).toMatchObject({ provider: 'openai', total: 6, requests: 1 })
    expect(f.byModel.size).toBe(3)
  })
  it('folds unreadable model identities into the unknown bucket', () => {
    const f = fold(
      usageEvent(FROM + 1000, { inputTokens: 3 }, { kind: 'model' }),
      usageEvent(FROM + 2000, { inputTokens: 4 }, null),
    )
    const unknown = f.byModel.get('unknown/unknown')
    expect(unknown).toMatchObject({ provider: 'unknown', model: 'unknown', input: 7, requests: 2 })
    expect(f.byModel.size).toBe(1)
  })
})

describe('buildUsageReport', () => {
  /** A fold with a byDay bucket on exactly one local date. */
  function sessionFold(
    id: string,
    createdAt: number,
    total: number,
    requests: number,
    date: string,
    models: Array<[provider: string, model: string, modelTotal: number]> = [],
  ): SessionUsageFold {
    const byDay = new Map<string, {
      date: string
      input: number
      output: number
      cacheRead: number
      cacheWrite: number
      requests: number
      total: number
    }>()
    byDay.set(date, { date, input: total, output: 0, cacheRead: 0, cacheWrite: 0, requests, total })
    const byModel = new Map<string, {
      provider: string
      model: string
      input: number
      output: number
      cacheRead: number
      cacheWrite: number
      requests: number
      total: number
    }>()
    for (const [provider, model, modelTotal] of models) {
      byModel.set(`${provider}/${model}`, { provider, model, input: modelTotal, output: 0, cacheRead: 0, cacheWrite: 0, requests: 1, total: modelTotal })
    }
    return { sessionId: id, createdAt, input: total, output: 0, cacheRead: 0, cacheWrite: 0, total, requests, byDay, byModel }
  }

  it('assembles totals, day rows, and total-descending task rows', () => {
    const big = sessionFold('big', FROM, 50, 5, '2026-08-14')
    const small = sessionFold('small', FROM, 10, 1, '2026-08-14')
    const report = buildUsageReport({
      from: FROM, to: TO,
      folds: [small, big],
      titles: new Map([['big', '大任务'], ['small', null]]),
      failedSessions: 1,
      scanned: 3,
    })
    expect(report.totals.sessions).toBe(2)
    expect(report.totals.requests).toBe(6)
    expect(report.totals.total).toBe(60)
    expect(report.byTask.map(row => row.sessionId)).toEqual(['big', 'small'])
    expect(report.byTask[0]?.title).toBe('大任务')
    expect(report.byTask[1]?.title).toBeNull()
    expect(report.byDay).toHaveLength(1)
    expect(report.byDay[0]?.total).toBe(60)
    expect(report.failedSessions).toBe(1)
    expect(report.scanned).toBe(3)
  })
  it('drops folds with zero requests and sorts day rows ascending', () => {
    const zero = sessionFold('zero', FROM, 0, 0, '2026-08-14')
    const a = sessionFold('a', FROM, 1, 1, '2026-08-13')
    const b = sessionFold('b', FROM, 1, 1, '2026-08-15')
    const report = buildUsageReport({
      from: FROM, to: TO, folds: [zero, b, a], titles: new Map(), failedSessions: 0, scanned: 3,
    })
    expect(report.totals.sessions).toBe(2)
    expect(report.byTask).toHaveLength(2)
    expect(report.byDay.map(row => row.date)).toEqual(['2026-08-13', '2026-08-15'])
  })
  it('merges the same model across sessions and sorts model rows total-descending', () => {
    const one = sessionFold('one', FROM, 20, 2, '2026-08-14', [['deepseek', 'deepseek-chat', 15], ['deepseek', 'deepseek-reasoner', 5]])
    const two = sessionFold('two', FROM, 30, 3, '2026-08-14', [['deepseek', 'deepseek-chat', 30]])
    const report = buildUsageReport({
      from: FROM, to: TO, folds: [one, two], titles: new Map(), failedSessions: 0, scanned: 2,
    })
    expect(report.byModel.map(row => `${row.provider}/${row.model}`)).toEqual(['deepseek/deepseek-chat', 'deepseek/deepseek-reasoner'])
    expect(report.byModel[0]).toMatchObject({ input: 45, requests: 2, total: 45 })
    expect(report.byModel[1]).toMatchObject({ input: 5, requests: 1, total: 5 })
  })
})
