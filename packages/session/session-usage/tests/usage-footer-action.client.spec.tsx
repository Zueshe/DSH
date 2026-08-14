// @vitest-environment jsdom
/**
 * UsageFooterAction: renders the footer trigger (wide label + rail icon),
 * opens the popup on click, and closes through the close button, the mask,
 * and Escape. The popup body reuses the shared UsagePanel (its data behavior
 * is covered by usage-section.client.spec.tsx).
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { UsageFooterAction, type UsageFooterActionProps } from '../src/client/UsageFooterAction.tsx'
import { en } from '../src/client/locales.ts'
import type { UsageReport } from '../src/types.ts'

afterEach(cleanup)

function report(): UsageReport {
  return {
    from: 0,
    to: 1,
    totals: { input: 100, output: 20, cacheRead: 300, cacheWrite: 0, total: 420, requests: 3, sessions: 2 },
    byDay: [{ date: '2026-08-14', input: 100, output: 20, cacheRead: 300, cacheWrite: 0, requests: 3, total: 420 }],
    byTask: [{ sessionId: 'a', title: '大任务', createdAt: 0, input: 80, output: 10, cacheRead: 200, cacheWrite: 0, total: 290, requests: 2 }],
    failedSessions: 0,
    scanned: 1,
  }
}

function renderAction(overrides: Partial<UsageFooterActionProps> = {}) {
  const props: UsageFooterActionProps = {
    wide: true,
    t: (key: keyof typeof en) => en[key],
    load: () => Promise.resolve(report()),
    ...overrides,
  } as UsageFooterActionProps
  return render(<UsageFooterAction {...props} />)
}

describe('UsageFooterAction', () => {
  it('renders a trigger labeled for the usage nav in the wide column', () => {
    renderAction()
    const trigger = screen.getByRole('button', { name: en.nav })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.textContent).toContain(en.nav)
  })

  it('opens the popup on trigger click and loads the shared panel body', async () => {
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: en.nav }))
    expect(screen.getByRole('dialog', { name: en.title })).toBeTruthy()
    await waitFor(() => { expect(screen.getByText('大任务')).toBeTruthy() })
  })

  it('closes via the popup close button', async () => {
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: en.nav }))
    fireEvent.click(screen.getByRole('button', { name: en['footer.close'] }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes via a mask click', () => {
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: en.nav }))
    fireEvent.click(screen.getByRole('presentation').querySelector('[aria-hidden="true"]')!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes via Escape and unhooks the listener with the popup', () => {
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: en.nav }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
