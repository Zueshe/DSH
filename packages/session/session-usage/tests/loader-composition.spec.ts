/**
 * REAL-composition proof: the shipped YAML shape (session-usage declared BEFORE
 * the webserver row) boots through the vendored Loader, the function plugin's
 * namespace survives (no default export), and the route is registered — the
 * `inject: ['webServer']` wait, not composition order, decides when the route
 * lands.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import * as SessionUsagePlugin from '@deepseek-ai/dsh-session-usage'

/** A fake webServer provider that records every registered route. */
function makeFakeWebServer(routes: Array<{ kind: string; path: string }>) {
  return {
    name: 'fake-webserver',
    apply(ctx: Context): void {
      ctx.provide('webServer', {
        register: (route: { kind: string; path: string }) => {
          routes.push({ kind: route.kind, path: route.path })
          return () => { /* no-op disposer */ }
        },
      } as never)
    },
  }
}

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function loadComposition(lines: readonly string[]): Promise<{ ctx: Context; routes: Array<{ kind: string; path: string }> }> {
  root = await mkdtemp(join(tmpdir(), 'dsh-session-usage-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [...lines, ''].join('\n'))

  const routes: Array<{ kind: string; path: string }> = []
  const FakeWebServer = makeFakeWebServer(routes)
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-host-webserver', FakeWebServer],
    ['@deepseek-ai/dsh-session-usage', SessionUsagePlugin],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  context = ctx
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  return { ctx, routes }
}

describe('session-usage host composition', () => {
  it('registers the usage route when declared before the webserver row', async () => {
    const { ctx, routes } = await loadComposition([
      "- name: '@deepseek-ai/dsh-session-usage'",
      "- name: '@deepseek-ai/dsh-host-webserver'",
    ])
    const unloaded = [...ctx.loader.entries()]
      .filter(entry => entry.fiber === undefined && !entry.disabled)
      .map(entry => entry.options.name)
    expect(unloaded).toEqual([])
    expect(routes).toContainEqual({ kind: 'exact', path: '/api/session-usage' })
  })

  it('keeps the function-plugin namespace free of a default export', () => {
    // A default export beside the named form makes the Loader discard the
    // namespace (postmortem 0001) — pin its absence.
    expect('default' in SessionUsagePlugin).toBe(false)
  })
})
