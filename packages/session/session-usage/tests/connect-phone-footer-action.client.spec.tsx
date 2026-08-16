// @vitest-environment jsdom
/**
 * ConnectPhoneFooterAction: renders the footer trigger (wide label + rail
 * icon), opens the popup on click, mints the pairing link through the issue
 * face, copies it, and surfaces the unavailable hint on failure. The mint
 * call rides the open click; the close paths mirror UsageFooterAction.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectPhoneFooterAction, type ConnectPhoneFooterActionProps } from '../src/client/ConnectPhoneFooterAction.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const LINK = 'https://example.trycloudflare.com/?pair=token123'

function renderAction(overrides: Partial<ConnectPhoneFooterActionProps> = {}) {
  const props: ConnectPhoneFooterActionProps = {
    wide: true,
    t: (key: keyof typeof en, params?: Record<string, unknown>) => {
      const text = en[key]
      return params === undefined
        ? text
        : text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))
    },
    issue: () => Promise.resolve({ url: LINK, expiresAt: Date.now() + 60_000 }),
    ...overrides,
  } as ConnectPhoneFooterActionProps
  return render(<ConnectPhoneFooterAction {...props} />)
}

describe('ConnectPhoneFooterAction', () => {
  it('renders a trigger labeled for the connect nav in the wide column', () => {
    renderAction()
    const trigger = screen.getByRole('button', { name: en['connect.nav'] })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.textContent).toContain(en['connect.nav'])
  })

  it('opens the popup on trigger click and shows the minted link', async () => {
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: en['connect.nav'] }))
    expect(screen.getByRole('dialog', { name: en['connect.title'] })).toBeTruthy()
    await waitFor(() => { expect(screen.getByText(LINK)).toBeTruthy() })
    expect(screen.getByRole('button', { name: en['connect.copy'] })).toBeTruthy()
  })

  it('copies the link and shows copied feedback', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: en['connect.nav'] }))
    await waitFor(() => { expect(screen.getByText(LINK)).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: en['connect.copy'] }))
    await waitFor(() => { expect(screen.getByText(en['connect.copied'])).toBeTruthy() })
  })

  it('surfaces the unavailable hint when minting fails', async () => {
    renderAction({ issue: () => Promise.reject(new Error('HTTP 403')) })
    fireEvent.click(screen.getByRole('button', { name: en['connect.nav'] }))
    await waitFor(() => { expect(screen.getByText(en['connect.unavailable'])).toBeTruthy() })
    expect(screen.getByText(en['connect.error'].replace('{error}', 'HTTP 403'))).toBeTruthy()
  })

  it('closes via the popup close button', () => {
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: en['connect.nav'] }))
    fireEvent.click(screen.getByRole('button', { name: en['connect.close'] }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes via Escape', () => {
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: en['connect.nav'] }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
