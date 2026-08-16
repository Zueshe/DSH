/**
 * Live-preferred collection: enumerates the corpus, folds each session log,
 * attaches titles, and isolates per-session read failures as a counted skip.
 */

import { describe, expect, it } from 'vitest'
import type { SessionHeader, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionQueryEngine } from '@deepseek-ai/dsh-session-query'
import type { SessionLogSnapshot, SessionRecord, SessionTitleObservationResult } from '@deepseek-ai/dsh-session-query'
import { collectUsageReport } from '../src/query.ts'

const NOW = Date.now()
const FROM = NOW - 7 * 24 * 60 * 60 * 1000

function header(id: string, createdAt = NOW): SessionHeader {
  return { version: 0, id: id as SessionId, createdAt }
}

function record(id: string, createdAt?: number): SessionRecord {
  return { header: header(id, createdAt), live: false, persisted: true }
}

function usageEvent(time: number, model = 'mock'): SessionEvent {
  return {
    type: 'assistant/message',
    seq: 0,
    time,
    data: { turn: 0, step: 0, message: { role: 'assistant', content: [], source: { kind: 'model', provider: 'mock', model } }, usage: { inputTokens: 10, outputTokens: 2 } },
    surfaceOp: 'append',
    sourceEventSeqs: [],
  } as unknown as SessionEvent
}

function log(id: string, events: readonly SessionEvent[] = []): SessionLogSnapshot {
  return { session: header(id), events: [...events] }
}

interface FakeQuery {
  sessions: SessionRecord[]
  logs: Map<string, SessionLogSnapshot>
  titles: Map<string, string | null>
  failing: Set<string>
  calls: { read: string[]; titles: number }
}

function fakeEngine(fake: FakeQuery): SessionQueryEngine {
  return {
    async listSessions() { return fake.sessions },
    async readSession(id: SessionId) {
      fake.calls.read.push(String(id))
      if (fake.failing.has(String(id))) throw new Error(`read failed: ${String(id)}`)
      return fake.logs.get(String(id)) ?? log(String(id))
    },
    async readTitleSnapshots(ids: readonly SessionId[]): Promise<SessionTitleObservationResult[]> {
      fake.calls.titles += 1
      return ids.map((id) => {
        const title = fake.titles.get(String(id))
        return title === undefined
          ? { sessionId: id, status: 'rejected' as const, reason: new Error('missing') }
          : { sessionId: id, status: 'fulfilled' as const, value: { session: header(String(id)), ...title === null ? {} : { title: { title, messageSeqs: [], source: { kind: 'fallback' }, eventSeq: 0, updatedAt: 0 } } } }
      })
    },
  } as unknown as SessionQueryEngine
}

function makeFake(): FakeQuery {
  return {
    sessions: [],
    logs: new Map(),
    titles: new Map(),
    failing: new Set(),
    calls: { read: [], titles: 0 },
  }
}

describe('collectUsageReport', () => {
  it('reports zero figures for an empty corpus', async () => {
    const fake = makeFake()
    const report = await collectUsageReport(fakeEngine(fake), { from: FROM, to: NOW })
    expect(report.scanned).toBe(0)
    expect(report.totals.sessions).toBe(0)
    expect(report.byTask).toEqual([])
  })

  it('folds usage, attaches titles, counts sessions, and breaks out models', async () => {
    const fake = makeFake()
    fake.sessions = [record('a'), record('b')]
    fake.logs.set('a', log('a', [usageEvent(FROM + 1000, 'deepseek-chat')]))
    fake.logs.set('b', log('b', [usageEvent(FROM + 2000, 'deepseek-reasoner'), usageEvent(FROM + 3000, 'deepseek-reasoner')]))
    fake.titles.set('a', '任务A')
    fake.titles.set('b', null)

    const report = await collectUsageReport(fakeEngine(fake), { from: FROM, to: NOW })
    expect(report.scanned).toBe(2)
    expect(report.totals.sessions).toBe(2)
    expect(report.totals.requests).toBe(3)
    expect(report.totals.total).toBe(3 * 12)
    expect(report.byModel.map(row => row.model)).toEqual(['deepseek-reasoner', 'deepseek-chat'])
    expect(report.byModel[0]).toMatchObject({ provider: 'mock', model: 'deepseek-reasoner', total: 24, requests: 2 })
    expect(report.byModel[1]).toMatchObject({ provider: 'mock', model: 'deepseek-chat', total: 12, requests: 1 })
    expect(report.byTask.map(row => row.sessionId)).toEqual(['b', 'a'])
    expect(report.byTask[0]?.title).toBeNull()
    expect(report.byTask[1]?.title).toBe('任务A')
  })

  it('skips sessions created after the range end without reading them', async () => {
    const fake = makeFake()
    const future = record('future', NOW + 10_000)
    fake.sessions = [future]
    const report = await collectUsageReport(fakeEngine(fake), { from: FROM, to: NOW })
    expect(report.scanned).toBe(1)
    expect(fake.calls.read).toEqual([])
  })

  it('counts failed reads and keeps other sessions', async () => {
    const fake = makeFake()
    fake.sessions = [record('bad'), record('good')]
    fake.logs.set('good', log('good', [usageEvent(FROM + 1000)]))
    fake.failing.add('bad')
    const report = await collectUsageReport(fakeEngine(fake), { from: FROM, to: NOW })
    expect(report.failedSessions).toBe(1)
    expect(report.totals.sessions).toBe(1)
    expect(report.totals.requests).toBe(1)
  })

  it('does not fail when title reads reject', async () => {
    const fake = makeFake()
    fake.sessions = [record('a')]
    fake.logs.set('a', log('a', [usageEvent(FROM + 1000)]))
    const engine = fakeEngine(fake)
    engine.readTitleSnapshots = async () => { throw new Error('title backend down') }
    const report = await collectUsageReport(engine, { from: FROM, to: NOW })
    expect(report.byTask[0]?.title).toBeNull()
    expect(report.totals.requests).toBe(1)
  })
})
