/**
 * Model-facing `computer_use` tool over `ctx.computerUse`. This package owns
 * the schema, per-action validation, prompt guidance, screenshot attachment,
 * and presentation, never the controllable surface itself. The tool stays
 * registered when the provider is absent and fails with a structured error at
 * execution time, mirroring the `dsh-tool-web` enablement contract.
 * @module @deepseek-ai/dsh-tool-computer-use
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-computer-use'
import { applyComputerUseTool } from './tool.ts'

export {
  COMPUTER_USE_ACTIONS,
  applyComputerUseTool,
  computerUseMetaFromResult,
  computerUseMetaFromValue,
  formatComputerUseOutput,
  parseComputerUseArgs,
  presentComputerUseCall,
  presentComputerUseResult,
  renderComputerUseContent,
} from './tool.ts'
export type {
  ComputerUseAction,
  ComputerUseArgs,
  ComputerUseMeta,
  ComputerUseScreenshot,
  ComputerUseValue,
  ParsedComputerUseArgs,
} from './tool.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-computer-use'

/** Services required by the computer-use tool. */
export const inject = ['tools', 'attachments', 'systemPrompt']

/** Default cooperative tool-call budget (ms), covering first-call Chromium launch plus one navigation. */
export const DEFAULT_COMPUTER_USE_TIMEOUT_MS = 60_000

/** Plugin config: the per-call budget and whether observations return images. */
export interface Config {
  /** Cooperative timeout budget (ms) for one `computer_use` call. Defaults to 60000. */
  timeoutMs?: number
  /** Commit each observation as a durable image and return it as an image block. Defaults to true. */
  includeScreenshot?: boolean
}

export const Config: z<Config> = z.object({
  timeoutMs: z.number().default(DEFAULT_COMPUTER_USE_TIMEOUT_MS),
  includeScreenshot: z.boolean().default(true),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/** The timeout budget must be a positive integer. */
function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`tool-computer-use: ${name} must be a positive integer`)
  }
}

/**
 * Register the `computer_use` tool. The cooperative timeout budget
 * (`timeoutMs`, default 60000) is attached to the tool as
 * `ToolDefinition.timeoutMs` for `@deepseek-ai/dsh-tool-call-timeout-policy`
 * to enforce. Observations are committed through the durable attachment
 * service when `includeScreenshot` holds (the default).
 */
export function apply(ctx: Context, config: Config): void {
  // schemastery (Config) has already filled every defaulted field.
  const resolved = config as ResolvedConfig
  assertPositiveInteger('timeoutMs', resolved.timeoutMs)
  applyComputerUseTool(ctx, resolved.timeoutMs, resolved.includeScreenshot, async (observation) => {
    const ref = await ctx.attachments.saveImage({
      data: observation.screenshot,
      mediaType: 'image/png',
      name: 'computer-use.png',
    })
    if (ref.mediaType !== 'image/png') {
      // The provider contract captures PNG rasters; anything else is a provider
      // defect surfaced loud instead of silently attached.
      throw new Error(`tool-computer-use: expected a PNG observation, got ${ref.mediaType}`)
    }
    return { ...ref, mediaType: 'image/png' }
  })
}
