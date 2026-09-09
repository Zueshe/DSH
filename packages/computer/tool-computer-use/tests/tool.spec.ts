/**
 * The `computer_use` tool over a fake controllable surface: schema-to-seam
 * mapping, per-action validation, durable screenshot attachment, presentation
 * projection, provider-absent failure, and registry disposal — everything
 * through `ctx.tools.execute()`, never bypassing the tool registry.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { ComputerUseService } from '@deepseek-ai/dsh-computer-use'
import type { ComputerObservation, ComputerPoint } from '@deepseek-ai/dsh-computer-use'
import * as ToolComputerUse from '../src/index.ts'
import {
  computerUseMetaFromResult,
  computerUseMetaFromValue,
  formatComputerUseOutput,
  parseComputerUseArgs,
  presentComputerUseCall,
  presentComputerUseResult,
  renderComputerUseContent,
} from '../src/index.ts'

const testToolSignal = new AbortController().signal

/** One known-good 1x1 PNG the attachment store decodes and the tool attaches. */
const ONE_BY_ONE_PNG = new Uint8Array(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
))

/** Recorded seam calls, so tests assert the tool's mapping onto the seam. */
const seamCalls: string[] = []

class FakeSurface extends ComputerUseService {
  override async navigate(url: string): Promise<ComputerObservation> {
    seamCalls.push(`navigate:${url}`)
    return this.observation(url)
  }

  override async observe(): Promise<ComputerObservation> {
    seamCalls.push('observe')
    return this.observation('https://example.test/current')
  }

  override async click(point: ComputerPoint): Promise<ComputerObservation> {
    seamCalls.push(`click:${point.x},${point.y}`)
    return this.observation('https://example.test/clicked')
  }

  override async type(text: string): Promise<ComputerObservation> {
    seamCalls.push(`type:${text}`)
    return this.observation('https://example.test/typed')
  }

  private observation(url: string): ComputerObservation {
    return { screenshot: ONE_BY_ONE_PNG, url, title: `Title of ${url}` }
  }
}

let ctx: Context
let surfaceFiber: Awaited<ReturnType<Context['plugin']>>
let toolFiber: Awaited<ReturnType<Context['plugin']>>
let dshHome: string

beforeEach(async () => {
  seamCalls.length = 0
  dshHome = await mkdtemp(join(tmpdir(), 'dsh-tool-computer-use-'))
  ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LocalAttachmentStore, { dshHome })
  surfaceFiber = await ctx.plugin(FakeSurface)
})

afterEach(async () => {
  await toolFiber.dispose()
  await surfaceFiber.dispose()
  await ctx.fiber.dispose()
  await rm(dshHome, { recursive: true, force: true })
})

async function mountTool(config?: ToolComputerUse.Config): Promise<void> {
  toolFiber = await ctx.plugin(ToolComputerUse, config ?? {})
}

let counter = 0
function call(args: unknown): Promise<ToolExecutionResult> {
  counter += 1
  return ctx.tools.execute({ signal: testToolSignal, callId: ToolCallId(`call-${counter}`), name: 'computer_use', arguments: args })
}

describe('computer_use over a fake surface', () => {
  it('maps each action onto the seam and returns url and title', async () => {
    await mountTool()
    const out = await call({ action: 'navigate', url: 'https://example.test/start' })
    expect(out.isError).toBe(false)
    expect(seamCalls).toEqual(['navigate:https://example.test/start'])
    expect(out.value).toMatchObject({ action: 'navigate', url: 'https://example.test/start', title: 'Title of https://example.test/start' })
  })

  it('attaches the screenshot as a durable, verifiable image block', async () => {
    await mountTool()
    const out = await call({ action: 'screenshot' })
    expect(out.isError).toBe(false)
    const image = out.content.find(block => block.type === 'image')
    expect(image).toBeDefined()
    if (image?.type !== 'image') throw new Error('unreachable')
    const stored = await ctx.attachments.readImage(image.attachment)
    expect(Array.from(stored.data)).toEqual(Array.from(ONE_BY_ONE_PNG))
    expect(out.value).toMatchObject({ screenshot: { mediaType: 'image/png', width: 1, height: 1 } })
  })

  it('omits the image when includeScreenshot is false', async () => {
    await mountTool({ includeScreenshot: false })
    const out = await call({ action: 'click', x: 10, y: 20 })
    expect(out.isError).toBe(false)
    expect(out.content.some(block => block.type === 'image')).toBe(false)
    expect(out.value).not.toHaveProperty('screenshot')
    expect(out.content.map(block => block.type === 'text' ? block.text : '').join('')).toContain('observations are text-only')
  })

  it('forwards click coordinates and type text to the seam', async () => {
    await mountTool()
    await call({ action: 'click', x: 128, y: 256 })
    await call({ action: 'type', text: 'hello world' })
    expect(seamCalls).toEqual(['click:128,256', 'type:hello world'])
  })

  it('rejects per-action constraint violations as structured tool errors', async () => {
    await mountTool()
    for (const args of [
      { action: 'navigate' },
      { action: 'navigate', url: 'data:text/html,hi' },
      { action: 'click', x: -1, y: 0 },
      { action: 'click', x: 1.5, y: 0 },
      { action: 'type', text: '' },
    ]) {
      const out = await call(args)
      expect(out.isError, JSON.stringify(args)).toBe(true)
    }
    expect(seamCalls).toEqual([])
  })

  it('fails at execution time when the provider is absent', async () => {
    await mountTool()
    await surfaceFiber.dispose()
    const out = await call({ action: 'screenshot' })
    expect(out.isError).toBe(true)
    expect(out.content.map(block => block.type === 'text' ? block.text : '').join('')).toContain('computerUse service is unavailable')
  })

  it('renders the guidance section and removes the tool on dispose', async () => {
    await mountTool()
    const prompt = await ctx.systemPrompt.assemble()
    const text = prompt.sections.map(section => section.text).join('\n')
    expect(text).toContain('Use the computer_use tool to drive the controllable browser surface')
    expect(ctx.tools.schemas().map(schema => schema.name)).toContain('computer_use')
    await toolFiber.dispose()
    expect(ctx.tools.schemas().map(schema => schema.name)).not.toContain('computer_use')
  })
})

describe('computer_use pure projections', () => {
  it('parses each action into its discriminated form', () => {
    expect(parseComputerUseArgs({ action: 'navigate', url: 'https://a.test/' })).toEqual({ action: 'navigate', url: 'https://a.test/' })
    expect(parseComputerUseArgs({ action: 'screenshot' })).toEqual({ action: 'screenshot' })
    expect(parseComputerUseArgs({ action: 'click', x: 1, y: 2 })).toEqual({ action: 'click', x: 1, y: 2 })
    expect(parseComputerUseArgs({ action: 'type', text: 'hi' })).toEqual({ action: 'type', text: 'hi' })
  })

  it('formats, renders, and projects one observation', () => {
    const value = {
      action: 'screenshot',
      url: 'https://example.test/',
      title: 'Example',
      screenshot: { attachmentId: 'att', mediaType: 'image/png', bytes: 3, width: 4, height: 5 },
    } as const
    expect(formatComputerUseOutput(value)).toContain('A 4x5 screenshot is attached')
    const content = renderComputerUseContent(value)
    expect(content.map(block => block.type)).toEqual(['text', 'image'])
    const meta = computerUseMetaFromValue(value)
    expect(computerUseMetaFromResult(meta)).toEqual({ action: 'screenshot', url: 'https://example.test/', title: 'Example', hasScreenshot: true })
    expect(computerUseMetaFromResult({ action: 'nope', url: '', title: '', hasScreenshot: false })).toBeUndefined()
    expect(computerUseMetaFromResult(undefined)).toBeUndefined()
  })

  it('presents the call and the result as generic cards', () => {
    expect(presentComputerUseCall({ action: 'navigate', url: 'https://a.test/' })).toMatchObject({
      card: 'generic',
      title: 'computer use: navigate https://a.test/',
    })
    const meta = computerUseMetaFromValue({ action: 'screenshot', url: 'https://a.test/', title: 'A' })
    const result = { isError: false, content: [], meta }
    expect(presentComputerUseResult({ action: 'screenshot' }, result as never)).toMatchObject({
      card: 'generic',
      title: 'screenshot — A',
    })
    expect(presentComputerUseResult({ action: 'screenshot' }, { isError: true, content: [], meta })).toBeUndefined()
  })
})
