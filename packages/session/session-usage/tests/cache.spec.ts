/**
 * The revision-gated row store: a row is served only at the exact revision
 * it was stored at, store replaces previous revisions, prune drops rows for
 * sessions the corpus no longer lists, and dispose clears everything.
 */

import { describe, expect, it } from 'vitest'
import { SessionPersistenceRevision } from '@deepseek-ai/dsh-session-persistence'
import { UsageSessionCache } from '../src/cache.ts'

const R1 = SessionPersistenceRevision('r1')
const R2 = SessionPersistenceRevision('r2')

const SAMPLES = [{ time: 1, provider: 'mock', model: 'mock', input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }]

describe('UsageSessionCache', () => {
  it('serves a row only at the exact stored revision', () => {
    const cache = new UsageSessionCache()
    cache.store('a', { revision: R1, samples: SAMPLES, title: null })
    expect(cache.matching('a', R1)?.samples).toBe(SAMPLES)
    expect(cache.matching('a', R2)).toBeUndefined()
    expect(cache.matching('b', R1)).toBeUndefined()
  })

  it('replaces the previous row on store', () => {
    const cache = new UsageSessionCache()
    cache.store('a', { revision: R1, samples: SAMPLES, title: null })
    const replacement = { revision: R2, samples: SAMPLES, title: 't' }
    cache.store('a', replacement)
    expect(cache.matching('a', R2)).toBe(replacement)
    expect(cache.matching('a', R1)).toBeUndefined()
  })

  it('prunes rows for sessions absent from one listing', () => {
    const cache = new UsageSessionCache()
    cache.store('kept', { revision: R1, samples: SAMPLES, title: null })
    cache.store('deleted', { revision: R1, samples: SAMPLES, title: null })
    cache.prune(['kept', 'newcomer'])
    expect(cache.matching('kept', R1)).toBeDefined()
    expect(cache.matching('deleted', R1)).toBeUndefined()
  })

  it('clears every row on dispose', () => {
    const cache = new UsageSessionCache()
    cache.store('a', { revision: R1, samples: SAMPLES, title: null })
    cache.dispose()
    expect(cache.matching('a', R1)).toBeUndefined()
  })
})
