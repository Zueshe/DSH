/**
 * REAL-composition boot: a test-only `cordis.yml` loads the real loader, the
 * real Playwright provider, the real attachment store, and the real
 * `computer_use` tool, then asserts the model-visible registration — the tool
 * schema in the catalog, the guidance in the assembled prompt, and the provider
 * behind `ctx.computerUse`. No browser is launched: the provider starts
 * Chromium lazily on first action.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local'
import { ComputerUsePlaywright } from '@deepseek-ai/dsh-computer-use-playwright'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as provider from '@deepseek-ai/dsh-computer-use-playwright'
import * as tool from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function loadComposition(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-tool-computer-use-loader-'))
  const dshHome = join(root, 'home')
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@deepseek-ai/dsh-attachment-local'",
    '  config:',
    `    dshHome: ${JSON.stringify(dshHome)}`,
    "- name: '@deepseek-ai/dsh-computer-use-playwright'",
    '  config:',
    '    headless: true',
    "- name: '@deepseek-ai/dsh-tool-computer-use'",
    '',
  ].join('\n'))

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-attachment-local', LocalAttachmentStore],
    ['@deepseek-ai/dsh-computer-use-playwright', provider],
    ['@deepseek-ai/dsh-tool-computer-use', tool],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()
  return context
}

describe('real Loader composition', () => {
  it('exposes computer_use with the playwright provider and prompt guidance', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition()
    const names = loaded.tools.schemas().map(schema => schema.name)
    expect(names).toContain('computer_use')
    const schema = loaded.tools.schemas().find(entry => entry.name === 'computer_use')
    expect(schema?.description).toContain('screenshot')
    expect(loaded.get('computerUse')).toBeInstanceOf(ComputerUsePlaywright)
    const prompt = await loaded.systemPrompt.assemble()
    expect(prompt.sections.map(section => section.text).join('\n')).toContain('Use the computer_use tool to drive the controllable browser surface')
  })
})
