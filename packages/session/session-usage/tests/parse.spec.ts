/**
 * Route range parsing: finite, non-negative, from <= to only.
 */

import { describe, expect, it } from 'vitest'
import { parseUsageRange } from '../src/index.ts'

describe('parseUsageRange', () => {
  it('parses a valid from/to pair', () => {
    expect(parseUsageRange(new URL('http://dsh.local/api/session-usage?from=1&to=2')))
      .toEqual({ from: 1, to: 2 })
  })
  it('rejects a missing, NaN, negative, or reversed range', () => {
    expect(parseUsageRange(new URL('http://dsh.local/api/session-usage'))).toBeUndefined()
    expect(parseUsageRange(new URL('http://dsh.local/api/session-usage?from=1'))).toBeUndefined()
    expect(parseUsageRange(new URL('http://dsh.local/api/session-usage?from=abc&to=2'))).toBeUndefined()
    expect(parseUsageRange(new URL('http://dsh.local/api/session-usage?from=-1&to=2'))).toBeUndefined()
    expect(parseUsageRange(new URL('http://dsh.local/api/session-usage?from=5&to=2'))).toBeUndefined()
  })
})
