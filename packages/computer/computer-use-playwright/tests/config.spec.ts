/**
 * Provider configuration: defaults the deployment inherits and constraints
 * that must fail loud at load, asserted directly against the schemastery
 * schema.
 */

import { describe, expect, it } from 'vitest'
import { ComputerUsePlaywright, Config } from '../src/index.ts'

describe('computer-use-playwright config', () => {
  it('resolves every omitted field explicitly', () => {
    expect(ComputerUsePlaywright.Config({})).toEqual({
      headless: true,
      viewportWidth: 1280,
      viewportHeight: 800,
      navigationTimeoutMs: 30_000,
      settleTimeoutMs: 1500,
    })
  })

  it('accepts an explicit composition, including a disabled settle wait', () => {
    expect(Config({ headless: false, viewportWidth: 1024, viewportHeight: 768, navigationTimeoutMs: 5000, settleTimeoutMs: 0 })).toEqual({
      headless: false,
      viewportWidth: 1024,
      viewportHeight: 768,
      navigationTimeoutMs: 5000,
      settleTimeoutMs: 0,
    })
  })

  it('rejects a viewport below the floor', () => {
    expect(() => Config({ viewportWidth: 100 })).toThrow()
    expect(() => Config({ viewportHeight: 0 })).toThrow()
  })

  it('rejects a non-integer viewport and a sub-second navigation budget', () => {
    expect(() => Config({ viewportWidth: 1000.5 })).toThrow()
    expect(() => Config({ navigationTimeoutMs: 999 })).toThrow()
  })
})
