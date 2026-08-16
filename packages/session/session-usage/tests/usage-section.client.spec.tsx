// @vitest-environment jsdom
/**
 * Usage Statistics settings section: renders summary cards, per-day bars, and
 * a per-model table from the injected load result; loading and error states
 * surface; token counts at or above 100 million abbreviate to 亿 with the
 * exact value on the native title tooltip.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
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
    byModel: [
      { provider: 'deepseek', model: 'deepseek-chat', input: 80, output: 15, cacheRead: 200, cacheWrite: 0, total: 295, requests: 2 },
      { provider: 'deepseek', model: 'deepseek-reasoner', input: 20, output: 5, cacheRead: 100, cacheWrite: 0, total: 125, requests: 1 },
    ],
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
  it('renders summary cards and day rows after load', async () => {
    renderSection(() => Promise.resolve(report()))
    expect(screen.getByText(en.loading)).toBeTruthy()
    await waitFor(() => { expect(screen.getAllByText('420').length).toBeGreaterThan(0) })
    expect(screen.getAllByText('100').length).toBeGreaterThan(0) // input card
    expect(screen.getByText('2026-08-14')).toBeTruthy() // day label
  })

  it('renders one total-descending row per provider-model identity', async () => {
    renderSection(() => Promise.resolve(report()))
    await waitFor(() => { expect(screen.getByText(en.byModel)).toBeTruthy() })
    const modelCells = [...document.querySelectorAll('[class*="modelCell"]')].map(el => el.textContent)
    expect(modelCells).toEqual(['deepseek / deepseek-chat', 'deepseek / deepseek-reasoner'])
    expect(screen.getByText('295')).toBeTruthy() // deepseek-chat total
    expect(screen.getByText('125')).toBeTruthy() // deepseek-reasoner total
  })

  it('shows the cache hit rate card after output', async () => {
    renderSection(() => Promise.resolve(report()))
    await waitFor(() => { expect(screen.getByText('75.0%')).toBeTruthy() })
    const cards = [...document.querySelectorAll('[class*="cardLabel"]')].map(el => el.textContent)
    const outputIndex = cards.indexOf(en.output)
    const hitIndex = cards.indexOf(en.cacheHitRate)
    expect(outputIndex).toBeGreaterThanOrEqual(0)
    expect(hitIndex).toBe(outputIndex + 1)
  })

  it('renders a dash for the cache hit rate when there is no input', async () => {
    renderSection(() => Promise.resolve(report({
      totals: { input: 0, output: 10, cacheRead: 0, cacheWrite: 0, total: 10, requests: 1, sessions: 1 },
    })))
    await waitFor(() => { expect(screen.getByText(en.cacheHitRate)).toBeTruthy() })
    const card = [...document.querySelectorAll('[class*="card"]')]
      .find(el => el.querySelector('[class*="cardLabel"]')?.textContent === en.cacheHitRate)
    expect(card?.querySelector('[class*="cardValue"]')?.textContent).toBe('—')
  })

  it('surfaces the load error and stops loading', async () => {
    renderSection(() => Promise.reject(new Error('backend down')))
    await waitFor(() => { expect(screen.getByText(`${en.error}: backend down`)).toBeTruthy() })
  })

  it('shows the empty state when no usage exists', async () => {
    renderSection(() => Promise.resolve(report({
      totals: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, requests: 0, sessions: 0 },
      byDay: [],
      byModel: [],
      byTask: [],
    })))
    await waitFor(() => { expect(screen.getAllByText(en.empty).length).toBeGreaterThan(0) })
  })

  it('abbreviates token counts at or above 100 million and keeps the exact value in the tooltip', async () => {
    renderSection(() => Promise.resolve(report({
      totals: { input: 123_456_789, output: 20, cacheRead: 300, cacheWrite: 0, total: 123_457_109, requests: 3, sessions: 2 },
    })))
    await waitFor(() => { expect(screen.getAllByText('1.23亿').length).toBeGreaterThan(0) })
    const totalCard = [...document.querySelectorAll('[class*="card"]')]
      .find(el => el.querySelector('[class*="cardLabel"]')?.textContent === en.totalTokens)
    expect(totalCard?.querySelector('[class*="cardValue"]')?.getAttribute('title')).toBe('123,457,109')
  })

  it('keeps token counts below 100 million in plain format', async () => {
    renderSection(() => Promise.resolve(report()))
    await waitFor(() => { expect(screen.getAllByText('420').length).toBeGreaterThan(0) })
    expect(screen.queryByText(/亿/)).toBeNull()
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
