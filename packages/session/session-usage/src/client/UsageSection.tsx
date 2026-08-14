/**
 * Usage Statistics settings section: a thin registration wrapper over the
 * shared {@link UsagePanel} presentation body. The settings section and the
 * sidebar footer popup render the same body through the same inject face.
 */

import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { UsageRange, UsageReport } from '../types.ts'
import { NS } from './locales.ts'
import { UsagePanel } from './UsagePanel.tsx'

export { resolveRange } from './UsagePanel.tsx'
export type { UsagePanelFace } from './UsagePanel.tsx'

/** Registration-side business face for the settings section. */
export interface UsageSectionInjected {
  /** Fetch the report for one range; called on mount and range change. */
  load: (range: UsageRange) => Promise<UsageReport>
}

/** Full component props. */
export type UsageSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<typeof NS>
  & InjectFace<UsageSectionInjected>

/**
 * Render the usage-statistics settings page.
 * @param props - section props plus the injected load callback and locale `t`.
 * @returns the settings page content.
 */
export function UsageSection(props: UsageSectionProps): ReactNode {
  const { t, load } = props
  return <UsagePanel t={t} load={load} />
}
