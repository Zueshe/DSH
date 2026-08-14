/** Browser plugin owning the Usage Statistics settings section. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { UsageStatsController } from './controller.ts'
import { en, NS, zh, type UsageKey } from './locales.ts'
import { UsageSection, type UsageSectionInjected } from './UsageSection.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'session-usage': UsageKey
  }
}

/** Required services: the slot registry and the locale dictionary registry. */
export const inject = ['slots', 'locale']

/**
 * Register the Usage Statistics settings section bound to a fresh controller.
 * @param ctx - browser context carrying slots and locale services.
 */
export function apply(ctx: ClientContext): void {
  const controller = new UsageStatsController()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-usage: browser dictionaries')
  const injected = (): UsageSectionInjected => ({
    load: range => controller.query(range),
  })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'usage-stats',
    order: 30,
    label: () => ctx.locale.bind(NS)('nav'),
    locale: NS,
    inject: injected,
  }, UsageSection))
}
