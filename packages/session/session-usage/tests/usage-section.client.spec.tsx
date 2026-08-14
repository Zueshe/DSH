// @vitest-environment jsdom
/**
 * Usage Statistics settings section: renders summary cards, per-day bars, and
 * the per-task table from the injected load result; loading and error states
 * surface; the task search filter narrows rows.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { UsageSection, resolveRange, type UsageSectionProps } from '../src/client/UsageSection.tsx'
import { en } from '../src/client/locales.ts'
import type { UsageReport } from '../src/types.ts'

afterEach(cleanup)

function report(overrides: Partial<UsageReport> = {}): UsageReport {
  return {
    from: 0,
    to: 1,
    totals: { input: 100, output: 20, cacheRead: 300, cacheWrite: 0, total: 420, requests: 3, sessions: 2 },
    byDay: [{ date: '2026-08-14', input: 100, output: 20, cacheRead: 300, cacheWrite: 0, requests: 3, total: 420 }],
    byTask: [
      { sessionId: 'a', title: '大任务', createdAt: 0, input: 80, output: 10, cacheRead: 200, cacheWrite: 0, total: 290, requests: 2 },
      { sessionId: 'b', title: null, createdAt: 0, input: 20, output: 10, cacheRead: 100, cacheWrite: 0, total: 130, requests: 1 },
    ],
    failedSessions: 0,
    scanned: 2,
    ...overrides,
  }
}

function renderSection(load: (range: { from: number; to: number }) => Promise<UsageReport>) {
  const props = {
    t: (key: keyof typeof en) => en[key],
    load,
  } as unknown as UsageSectionProps
  return render(<UsageSection {...props} />)
}

describe('UsageSection', () => {
  it('renders summary cards, day rows, and task rows after load', async () => {
    renderSection(() => Promise.resolve(report()))
    expect(screen.getByText(en.loading)).toBeTruthy()
    await waitFor(() => { expect(screen.getAllByText('420').length).toBeGreaterThan(0) })
    expect(screen.getAllByText('100').length).toBeGreaterThan(0) // input card
    expect(screen.getByText('大任务')).toBeTruthy()
    expect(screen.getByText(en.noTitle)).toBeTruthy() // untitled task fallback
    expect(screen.getByText('2026-08-14')).toBeTruthy() // day label
  })

  it('surfaces the load error and stops loading', async () => {
    renderSection(() => Promise.reject(new Error('backend down')))
    await waitFor(() => { expect(screen.getByText(`${en.error}: backend down`)).toBeTruthy() })
  })

  it('shows the empty state when no usage exists', async () => {
    renderSection(() => Promise.resolve(report({
      totals: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, requests: 0, sessions: 0 },
      byDay: [],
      byTask: [],
    })))
    await waitFor(() => { expect(screen.getAllByText(en.empty).length).toBeGreaterThan(0) })
  })

  it('narrows the task table with the search filter', async () => {
    const { container } = renderSection(() => Promise.resolve(report()))
    await waitFor(() => { expect(screen.getByText('大任务')).toBeTruthy() })
    const input = container.querySelector('input[type="search"]') as HTMLInputElement
    fireEvent.change(input, { target: { value: '大' } })
    await waitFor(() => {
      expect(screen.getByText('大任务')).toBeTruthy()
      expect(screen.queryByText(en.noTitle)).toBeNull()
    })
  })
})

describe('resolveRange', () => {
  it('starts six days before today and ends now for the 7d preset', () => {
    const before = Date.now()
    const range = resolveRange('7d', '', '')
    const after = Date.now()
    expect(range.to).toBeLessThanOrEqual(after)
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    expect(range.from).toBe(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000)
    expect(range.to).toBeGreaterThanOrEqual(before)
  })
  it('spans the whole earlier day to the whole later day for reversed custom dates', () => {
    const range = resolveRange('custom', '2026-02-01', '2026-01-01')
    expect(range.from).toBe(new Date(2026, 0, 1).getTime())
    expect(range.to).toBe(new Date(2026, 1, 1, 23, 59, 59, 999).getTime())
  })
})
