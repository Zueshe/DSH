/** Browser plugin owning the Usage Statistics settings section and sidebar footer action. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { UsageStatsController } from './controller.ts'
import { ConnectPhoneFooterAction, type ConnectPhoneFooterActionInjected, type ConnectPhoneLink } from './ConnectPhoneFooterAction.tsx'
import { en, NS, zh, type UsageKey } from './locales.ts'
import { UsageFooterAction, type UsageFooterActionInjected } from './UsageFooterAction.tsx'
import { UsageSection, type UsageSectionInjected } from './UsageSection.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'session-usage': UsageKey
  }
}

/** Required services: the slot registry and the locale dictionary registry. */
export const inject = ['slots', 'locale']

/**
 * Register the Usage Statistics settings section and sidebar footer action,
 * both bound to one fresh controller.
 * @param ctx - browser context carrying slots and locale services.
 */
export function apply(ctx: ClientContext): void {
  const controller = new UsageStatsController()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-usage: browser dictionaries')
  const sectionInjected = (): UsageSectionInjected => ({
    load: range => controller.query(range),
  })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'usage-stats',
    order: 30,
    label: () => ctx.locale.bind(NS)('nav'),
    locale: NS,
    inject: sectionInjected,
  }, UsageSection))
  const footerInjected = (): UsageFooterActionInjected => ({
    load: range => controller.query(range),
  })
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'usage-stats',
    order: 0,
    label: () => ctx.locale.bind(NS)('nav'),
    locale: NS,
    inject: footerInjected,
  }, UsageFooterAction))
  // Connect Phone rides the same footer row above the Usage Statistics entry.
  // It mints a mobile pairing link through the dsh-remote-web-ui /api/pair/issue
  // contract; unavailable without that plugin's tunnel or a LAN bind.
  const connectPhoneInjected = (): ConnectPhoneFooterActionInjected => ({
    issue: async (): Promise<ConnectPhoneLink> => {
      const response = await fetch('/api/pair/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data: unknown = await response.json()
      if (typeof data !== 'object' || data === null) throw new Error('invalid pairing response')
      const body = data as { ok?: unknown; url?: unknown; expiresAt?: unknown }
      if (body.ok !== true || typeof body.url !== 'string') throw new Error('invalid pairing response')
      return {
        url: body.url,
        expiresAt: typeof body.expiresAt === 'number' ? body.expiresAt : 0,
      }
    },
  })
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'connect-phone',
    order: -1,
    label: () => ctx.locale.bind(NS)('connect.nav'),
    locale: NS,
    inject: connectPhoneInjected,
  }, ConnectPhoneFooterAction))
}
