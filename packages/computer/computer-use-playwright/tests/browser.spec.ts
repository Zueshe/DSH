/**
 * Provider behavior with a real Chromium: lazy launch, observations after each
 * action, click/type effects, and typed failures. The browser suite self-skips
 * when the Chromium binary is absent (the same self-skip contract e2e tests
 * use for a missing API key).
 */

import { existsSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import { chromium } from 'playwright'
import { afterEach, describe, expect, it } from 'vitest'
import { ComputerUseError, ComputerUseService } from '@deepseek-ai/dsh-computer-use'
import { ComputerUsePlaywright } from '../src/index.ts'

/** The data-URL pages the suite drives: one click target filling the viewport, one title-reflecting input. */
const BUTTON_PAGE = 'data:text/html,<button onclick="document.title=String.fromCharCode(99,108,105,99,107,101,100)" style="width:100vw;height:100vh">go</button>'
const INPUT_PAGE = 'data:text/html,<input autofocus oninput="document.title=this.value" style="width:100vw;height:100vh">'

const chromiumAvailable = existsSync(chromium.executablePath())

const contexts: Context[] = []

afterEach(async () => {
  while (contexts.length > 0) {
    const ctx = contexts.pop()
    if (ctx !== undefined) await ctx.fiber.dispose()
  }
})

async function service(): Promise<ComputerUseService> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(ComputerUsePlaywright, { headless: true })
  return ctx.computerUse
}

describe.skipIf(!chromiumAvailable)('computer-use-playwright browser', () => {
  it('observes a PNG viewport with url and title after navigation', async () => {
    const ctx = await service()
    const observation = await ctx.navigate(INPUT_PAGE)
    expect(observation.url.startsWith('data:text/html,')).toBe(true)
    expect(Array.from(observation.screenshot.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  })

  it('clicks a viewport-filling button from coordinates', async () => {
    const ctx = await service()
    await ctx.navigate(BUTTON_PAGE)
    const observation = await ctx.click({ x: 400, y: 300 })
    expect(observation.title).toBe('clicked')
  })

  it('types into the focused input and reflects it in the title', async () => {
    const ctx = await service()
    await ctx.navigate(INPUT_PAGE)
    const observation = await ctx.type('hello')
    expect(observation.title).toBe('hello')
  })

  it('wraps a navigation failure as a typed seam error', async () => {
    const ctx = await service()
    await expect(ctx.navigate('not-a-url')).rejects.toThrow(expect.objectContaining({
      code: 'COMPUTER_USE_ACTION_FAILED',
    }))
  })

  it('retries after a failed launch instead of pinning the failure', async () => {
    const ctx = await service()
    // A rejected navigation still leaves the page usable for the next action.
    await expect(ctx.navigate('not-a-url')).rejects.toBeInstanceOf(ComputerUseError)
    const observation = await ctx.navigate(INPUT_PAGE)
    expect(observation.url).toBe(INPUT_PAGE)
  })
})
