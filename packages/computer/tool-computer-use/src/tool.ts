/**
 * The model-facing `computer_use` tool: drive the controllable surface through
 * `ctx.computerUse` and return the post-action observation — surface address,
 * title, and, when enabled, the PNG screenshot as a durable image the vision
 * route carries to the model. This module owns the schema, per-action argument
 * validation, result formatting, and presentation; the seam and its provider
 * own the surface.
 * @module @deepseek-ai/dsh-tool-computer-use/tool
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, JsonValue, ToolResult } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { ComputerObservation } from '@deepseek-ai/dsh-computer-use'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** The closed action vocabulary the model may request. */
export const COMPUTER_USE_ACTIONS = ['navigate', 'screenshot', 'click', 'type'] as const

/** One member of the action vocabulary. */
export type ComputerUseAction = typeof COMPUTER_USE_ACTIONS[number]

/** The schema-validated arguments of one `computer_use` call. */
export interface ComputerUseArgs {
  /** The requested action. */
  action: ComputerUseAction
  /** Absolute URL; required by `navigate`. */
  url?: string
  /** Viewport X coordinate; required by `click`. */
  x?: number
  /** Viewport Y coordinate; required by `click`. */
  y?: number
  /** Keystrokes for the focused element; required by `type`. */
  text?: string
}

/** One accepted call: the discriminated form of {@link ComputerUseArgs}. */
export type ParsedComputerUseArgs =
  | { action: 'navigate'; url: string }
  | { action: 'screenshot' }
  | { action: 'click'; x: number; y: number }
  | { action: 'type'; text: string }

/**
 * The durable screenshot reference as it appears in the canonical output value:
 * the JSON view of an {@link ImageAttachmentRef}, with the media type pinned to
 * the PNG every observation captures.
 */
export interface ComputerUseScreenshot {
  /** Opaque content-addressed storage identifier. */
  attachmentId: string
  /** Always `image/png`; observations capture PNG viewport rasters. */
  mediaType: 'image/png'
  /** Exact encoded byte length. */
  bytes: number
  /** Intrinsic encoded width in pixels. */
  width: number
  /** Intrinsic encoded height in pixels. */
  height: number
  /** Optional display name. */
  name?: string
}

/** The canonical `computer_use` output value persisted with the result. */
export interface ComputerUseValue {
  /** The executed action. */
  action: ComputerUseAction
  /** Post-action surface address. */
  url: string
  /** Post-action surface title. */
  title: string
  /** Durable reference to the post-action screenshot, when one was attached. */
  screenshot?: ComputerUseScreenshot
}

/**
 * Validate the per-action constraints the schema cannot express: `navigate`
 * needs an absolute http(s) URL, `click` needs non-negative integer
 * coordinates, and `type` needs non-empty text.
 *
 * @param args - the schema-validated `computer_use` arguments.
 * @returns the accepted arguments in discriminated form.
 */
export function parseComputerUseArgs(args: ComputerUseArgs): ParsedComputerUseArgs {
  switch (args.action) {
    case 'navigate': {
      let parsed: URL
      try {
        parsed = new URL(args.url ?? '')
      } catch {
        throw new Error('navigate requires an absolute URL')
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('navigate requires an http or https URL')
      }
      return { action: 'navigate', url: args.url as string }
    }
    case 'screenshot':
      return { action: 'screenshot' }
    case 'click': {
      const { x, y } = args
      if (x === undefined || y === undefined || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) {
        throw new Error('click requires non-negative integer x and y coordinates')
      }
      return { action: 'click', x, y }
    }
    case 'type': {
      const { text } = args
      if (text === undefined || text.length === 0) {
        throw new Error('type requires non-empty text')
      }
      return { action: 'type', text }
    }
  }
}

/**
 * Format one observation as the model-facing text block.
 *
 * @param value - the canonical `computer_use` output value.
 * @returns a one-paragraph summary of the post-action state.
 */
export function formatComputerUseOutput(value: ComputerUseValue): string {
  const screenshot = value.screenshot !== undefined
    ? ` A ${value.screenshot.width}x${value.screenshot.height} screenshot is attached as an image.`
    : ' No screenshot is attached; observations are text-only in this deployment.'
  return `Surface is now "${value.title}" at ${value.url}.${screenshot}`
}

/** Human label for one pending call: the action plus its target. */
function callTitle(args: ComputerUseArgs): string {
  switch (args.action) {
    case 'navigate': return `computer use: navigate ${args.url ?? ''}`
    case 'screenshot': return 'computer use: screenshot'
    case 'click': return `computer use: click (${args.x ?? '?'}, ${args.y ?? '?'})`
    case 'type': return `computer use: type ${JSON.stringify(args.text ?? '')}`
  }
}

/**
 * Pending-call presentation: a generic card titled by the action and target.
 *
 * @param args - the raw tool arguments.
 * @returns the generic card view shown while the call runs.
 */
export function presentComputerUseCall(args: ComputerUseArgs): GenericCallView {
  return { card: 'generic', kind: 'execute', title: callTitle(args), rawInput: callTitle(args) }
}

/** The replayable presentation meta: the observation without image bytes. */
export interface ComputerUseMeta {
  action: ComputerUseAction
  url: string
  title: string
  hasScreenshot: boolean
}

/**
 * Project a validated output value into its replayable presentation meta.
 *
 * @param value - the canonical `computer_use` output value.
 * @returns the observation summary as opaque JSON.
 */
export function computerUseMetaFromValue(value: ComputerUseValue): JsonValue {
  return {
    action: value.action,
    url: value.url,
    title: value.title,
    hasScreenshot: value.screenshot !== undefined,
  }
}

/**
 * Narrow opaque live or replayed result metadata to a {@link ComputerUseMeta}.
 * Malformed metadata returns `undefined` so presentation falls back to the
 * generic card instead of throwing during replay.
 *
 * @param meta - result metadata.
 * @returns the validated meta, or `undefined` for absent or malformed data.
 */
export function computerUseMetaFromResult(meta: unknown): ComputerUseMeta | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const { action, url, title, hasScreenshot } = meta as Record<string, unknown>
  if (typeof action !== 'string' || !(COMPUTER_USE_ACTIONS as readonly string[]).includes(action)) return undefined
  if (typeof url !== 'string' || typeof title !== 'string' || typeof hasScreenshot !== 'boolean') return undefined
  return { action: action as ComputerUseAction, url, title, hasScreenshot }
}

/**
 * Completed-call presentation: a generic result card carrying the observation
 * summary.
 *
 * @param _args - the raw tool arguments.
 * @param result - the final model-facing tool result.
 * @returns the generic result view, or `undefined` on failure or malformed meta.
 */
export function presentComputerUseResult(_args: ComputerUseArgs, result: ToolResult): GenericCallView | undefined {
  if (result.isError) return undefined
  const meta = computerUseMetaFromResult(result.meta)
  if (meta === undefined) return undefined
  return {
    card: 'generic',
    kind: 'execute',
    title: `${meta.action} — ${meta.title}`,
    rawInput: formatComputerUseOutput({ action: meta.action, url: meta.url, title: meta.title }),
  }
}

/**
 * Build the model-facing content of one completed call: the summary text plus,
 * when the observation was attached, the image block.
 *
 * @param value - the canonical `computer_use` output value.
 * @returns the render content blocks.
 */
export function renderComputerUseContent(value: ComputerUseValue): ContentBlock[] {
  const blocks: ContentBlock[] = [{ type: 'text', text: formatComputerUseOutput(value) }]
  if (value.screenshot !== undefined) {
    const shot = value.screenshot
    blocks.push({
      type: 'image',
      attachment: {
        attachmentId: AttachmentId(shot.attachmentId),
        mediaType: 'image/png',
        bytes: shot.bytes,
        width: shot.width,
        height: shot.height,
        ...shot.name !== undefined ? { name: shot.name } : {},
      },
    })
  }
  return blocks
}

/** JSON Schema for the durable screenshot reference inside the output value. */
const SCREENSHOT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    attachmentId: { type: 'string', required: true },
    mediaType: { type: 'string', required: true, enum: ['image/png'] },
    bytes: { type: 'integer', required: true },
    width: { type: 'integer', required: true },
    height: { type: 'integer', required: true },
    name: { type: 'string' },
  },
} as const

/**
 * Register the `computer_use` tool and its system-prompt guidance.
 *
 * @param ctx - context whose `tools` and `systemPrompt` registries receive the
 *   registrations; both are effect-scoped and unregister on plugin dispose.
 * @param timeoutMs - cooperative tool-call budget (ms) attached as the tool's
 *   `ToolDefinition.timeoutMs`.
 * @param includeScreenshot - whether observations are committed as durable
 *   images and returned to the model as image blocks.
 * @param saveObservation - commit one observation's screenshot bytes and return
 *   its durable PNG reference.
 */
export function applyComputerUseTool(
  ctx: Context,
  timeoutMs: number,
  includeScreenshot: boolean,
  saveObservation: (observation: ComputerObservation) => Promise<ComputerUseScreenshot>,
): void {
  ctx.systemPrompt.section({
    name: 'tool:computer_use',
    order: 117,
    text: 'Use the computer_use tool to drive the controllable browser surface: navigate to a URL, take a screenshot to observe the current state, click viewport coordinates, and type text into the focused element. Every action returns the post-action screenshot, page URL, and title. Read the screenshot to locate elements before clicking, and take a new screenshot after actions whose effect may still be settling.',
  })

  ctx.tools.register(defineTool({
    name: 'computer_use',
    description: 'Drive the controllable browser surface. Every action returns the post-action screenshot (as an image), the page URL, and the page title.',
    parameters: {
      action: { type: 'string', required: true, enum: [...COMPUTER_USE_ACTIONS], description: 'The action to perform.' },
      url: { type: 'string', description: 'Absolute http(s) URL; required for action "navigate".' },
      x: { type: 'integer', description: 'Viewport X coordinate; required for action "click".' },
      y: { type: 'integer', description: 'Viewport Y coordinate; required for action "click".' },
      text: { type: 'string', description: 'Text to type into the focused element; required for action "type".' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', required: true, enum: [...COMPUTER_USE_ACTIONS] },
          url: { type: 'string', required: true },
          title: { type: 'string', required: true },
          screenshot: SCREENSHOT_SCHEMA,
        },
      },
      render: (_args, value) => renderComputerUseContent(value),
      presentationMeta: (_args, value) => computerUseMetaFromValue(value),
    },
    timeoutMs,
    // Browser actions mutate the shared surface, so calls must not interleave.
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const input = parseComputerUseArgs(args)
      const service = ctx.get('computerUse')
      if (service === undefined) {
        throw new Error('the computerUse service is unavailable; mount a computer-use provider beside this tool')
      }
      let observation: ComputerObservation
      switch (input.action) {
        case 'navigate': observation = await service.navigate(input.url, exec.signal); break
        case 'screenshot': observation = await service.observe(exec.signal); break
        case 'click': observation = await service.click({ x: input.x, y: input.y }, exec.signal); break
        case 'type': observation = await service.type(input.text, exec.signal); break
      }
      const screenshot = includeScreenshot ? await saveObservation(observation) : undefined
      return {
        action: input.action,
        url: observation.url,
        title: observation.title,
        ...screenshot !== undefined ? { screenshot } : {},
      }
    },
    presentCall: presentComputerUseCall,
    presentResult: (args, result) => presentComputerUseResult(args, result),
  }))
}
