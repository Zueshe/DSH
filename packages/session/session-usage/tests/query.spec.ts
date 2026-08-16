/**
 * Live-preferred collection: enumerates the corpus, folds each session log,
 * attaches titles folded in the same read, and isolates per-session read
 * failures as a counted skip. With a persistence backend and a cache, repeat
 * queries skip unchanged logs (revision-gated), live sessions still re-read,
 * and range switches refold cached samples instead of re-reading.
 */

import { describe, expect, it } from 'vitest'
import type { SessionHeader, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type SessionPersistence from '@deepseek-ai/dsh-session-persistence'
import { SessionPersistenceRevision } from '@deepseek-ai/dsh-session-persistence'
import type { SessionQueryEngine } from '@deepseek-ai/dsh-session-query'
import type { SessionLogSnapshot, SessionRecord } from '@deepseek-ai/dsh-session-query'
import { collectUsageReport } from '../src/query.ts'
import { UsageSessionCache } from '../src/cache.ts'

const NOW = Date.now()
const FROM = NOW - 7 * 24 * 60 * 60 * 1000

function header(id: string, createdAt = NOW): SessionHeader {
  return { version: 0, id: id as SessionId, createdAt }
}

function record(id: string, createdAt?: number, live = false): SessionRecord {
  return { header: header(id, createdAt), live, persisted: !live }
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

function titleEvent(title: string): SessionEvent {
  return {
    type: 'session/title',
    seq: 1,
    time: NOW,
    data: { title, messageSeqs: [], source: { kind: 'fallback' } },
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
  failing: Set<string>
  /** Current per-session revision tokens served by the fake persistence. */
  revisions: Map<string, string>
  /** Set to make the snapshot listing itself fail. */
  snapshotFailure: boolean
  calls: { read: string[] }
}

function fakeEngine(fake: FakeQuery): SessionQueryEngine {
  return {
    async listSessions() { return fake.sessions },
    async readSession(id: SessionId) {
      fake.calls.read.push(String(id))
      if (fake.failing.has(String(id))) throw new Error(`read failed: ${String(id)}`)
      return fake.logs.get(String(id)) ?? log(String(id))
    },
  } as unknown as SessionQueryEngine
}

function fakePersistence(fake: FakeQuery): SessionPersistence {
  return {
    async listSnapshots() {
      if (fake.snapshotFailure) throw new Error('snapshot listing down')
      return [...fake.revisions].map(([id, revision]) => ({
        header: header(id),
        revision: SessionPersistenceRevision(revision),
      }))
    },
  } as unknown as SessionPersistence
}

function makeFake(): FakeQuery {
  return {
    sessions: [],
    logs: new Map(),
    failing: new Set(),
    revisions: new Map(),
    snapshotFailure: false,
    calls: { read: [] },
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

  it('folds usage, attaches titles folded from the same read, and breaks out models', async () => {
    const fake = makeFake()
    fake.sessions = [record('a'), record('b')]
    fake.logs.set('a', log('a', [titleEvent('任务A'), usageEvent(FROM + 1000, 'deepseek-chat')]))
    fake.logs.set('b', log('b', [usageEvent(FROM + 2000, 'deepseek-reasoner'), usageEvent(FROM + 3000, 'deepseek-reasoner')]))

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

  it('reads every log per query when no cache is passed', async () => {
    const fake = makeFake()
    fake.sessions = [record('a')]
    fake.logs.set('a', log('a', [usageEvent(FROM + 1000)]))
    const engine = fakeEngine(fake)
    await collectUsageReport(engine, { from: FROM, to: NOW }, { persistence: fakePersistence(fake) })
    await collectUsageReport(engine, { from: FROM, to: NOW }, { persistence: fakePersistence(fake) })
    expect(fake.calls.read).toEqual(['a', 'a'])
  })

  it('reads every log per query when a session has no snapshot revision', async () => {
    const fake = makeFake()
    fake.sessions = [record('a')]
    fake.logs.set('a', log('a', [usageEvent(FROM + 1000)]))
    const cache = new UsageSessionCache()
    const engine = fakeEngine(fake)
    await collectUsageReport(engine, { from: FROM, to: NOW }, { persistence: fakePersistence(fake), cache })
    await collectUsageReport(engine, { from: FROM, to: NOW }, { persistence: fakePersistence(fake), cache })
    // No revision to gate a row on, so every query reads the log again.
    expect(fake.calls.read).toEqual(['a', 'a'])
  })

  it('fails soft when the snapshot listing fails and still reads every log', async () => {
    const fake = makeFake()
    fake.sessions = [record('a')]
    fake.logs.set('a', log('a', [usageEvent(FROM + 1000)]))
    fake.snapshotFailure = true
    const report = await collectUsageReport(fakeEngine(fake), { from: FROM, to: NOW }, {
      persistence: fakePersistence(fake),
      cache: new UsageSessionCache(),
    })
    expect(report.totals.requests).toBe(1)
    expect(fake.calls.read).toEqual(['a'])
  })
})

describe('collectUsageReport caching', () => {
  function cachedFake(): FakeQuery {
    const fake = makeFake()
    fake.sessions = [record('a'), record('b')]
    fake.logs.set('a', log('a', [titleEvent('A'), usageEvent(FROM + 1000)]))
    fake.logs.set('b', log('b', [usageEvent(FROM - 3 * 24 * 60 * 60 * 1000), usageEvent(FROM + 2000)]))
    fake.revisions.set('a', 'r1')
    fake.revisions.set('b', 'r1')
    return fake
  }

  it('serves a repeat query without re-reading unchanged logs', async () => {
    const fake = cachedFake()
    const engine = fakeEngine(fake)
    const cache = new UsageSessionCache()
    const first = await collectUsageReport(engine, { from: FROM, to: NOW }, { persistence: fakePersistence(fake), cache })
    expect(fake.calls.read).toEqual(['a', 'b'])
    const second = await collectUsageReport(engine, { from: FROM, to: NOW }, { persistence: fakePersistence(fake), cache })
    expect(fake.calls.read).toEqual(['a', 'b'])
    expect(second).toEqual(first)
  })

  it('re-reads only the session whose revision changed', async () => {
    const fake = cachedFake()
    const engine = fakeEngine(fake)
    const cache = new UsageSessionCache()
    await collectUsageReport(engine, { from: FROM, to: NOW }, { persistence: fakePersistence(fake), cache })
    fake.logs.set('b', log('b', [usageEvent(FROM + 2000), usageEvent(FROM + 3000)]))
    fake.revisions.set('b', 'r2')
    const report = await collectUsageReport(engine, { from: FROM, to: NOW }, { persistence: fakePersistence(fake), cache })
    expect(fake.calls.read).toEqual(['a', 'b', 'b'])
    expect(report.totals.requests).toBe(3)
  })

  it('refolds cached samples for a different range without re-reading', async () => {
    const fake = cachedFake()
    const engine = fakeEngine(fake)
    const cache = new UsageSessionCache()
    await collectUsageReport(engine, { from: FROM, to: NOW }, { persistence: fakePersistence(fake), cache })
    const wideFrom = FROM - 7 * 24 * 60 * 60 * 1000
    const wide = await collectUsageReport(engine, { from: wideFrom, to: NOW }, { persistence: fakePersistence(fake), cache })
    expect(fake.calls.read).toEqual(['a', 'b'])
    // Session b's earlier event only counts inside the widened range.
    expect(wide.totals.requests).toBe(3)
  })

  it('re-reads live sessions every query even at an unchanged revision', async () => {
    const fake = makeFake()
    fake.sessions = [record('live', undefined, true), record('cold')]
    fake.logs.set('live', log('live', [usageEvent(FROM + 1000)]))
    fake.logs.set('cold', log('cold', [usageEvent(FROM + 2000)]))
    fake.revisions.set('live', 'r1')
    fake.revisions.set('cold', 'r1')
    const engine = fakeEngine(fake)
    const cache = new UsageSessionCache()
    await collectUsageReport(engine, { from: FROM, to: NOW }, { persistence: fakePersistence(fake), cache })
    fake.logs.set('live', log('live', [usageEvent(FROM + 1000), usageEvent(FROM + 3000)]))
    const report = await collectUsageReport(engine, { from: FROM, to: NOW }, { persistence: fakePersistence(fake), cache })
    // The live session re-read and saw its appended request; the cold one did not re-read.
    expect(fake.calls.read).toEqual(['live', 'cold', 'live'])
    expect(report.totals.requests).toBe(3)
  })
})
