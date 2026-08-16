/**
 * Usage Statistics presentation: range presets, summary cards, a per-day bar
 * list, and a per-model table. Token counts at or above 100 million abbreviate
 * to 亿 with the exact value on the native title tooltip. Pure props (the
 * locale `t` seat and the `load` callback), so the settings section and the
 * sidebar footer popup render the same body.
 */

import { useEffect, useState, type ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { UsageRange, UsageReport } from '../types.ts'
import { NS, type UsageKey } from './locales.ts'
import css from './UsageSection.module.css'

/** Business face shared by every Usage Statistics surface. */
export interface UsagePanelFace {
  /** Fetch the report for one range; called on mount and range change. */
  load: (range: UsageRange) => Promise<UsageReport>
}

/** Full props of the presentation body: the locale seat plus the load face. */
export type UsagePanelProps = {
  /** Translate a dictionary key of the `session-usage` namespace. */
  t: TranslateNS<typeof NS>
} & UsagePanelFace

const DAY_MS = 24 * 60 * 60 * 1000

/** One hundred million: token counts at or above this abbreviate to 亿. */
const YI = 100_000_000

type Preset = '7d' | '14d' | '30d' | 'custom'

/** Compute the inclusive query range for a preset. */
export function resolveRange(preset: Preset, customFrom: string, customTo: string): UsageRange {
  const now = Date.now()
  if (preset === 'custom') {
    // Swap the date strings (ISO dates compare lexicographically) so a
    // reversed custom range spans the whole earlier day to the whole later day.
    let fromDate = customFrom
    let toDate = customTo
    if (fromDate !== '' && toDate !== '' && fromDate > toDate) {
      const swap = fromDate
      fromDate = toDate
      toDate = swap
    }
    const fromMs = fromDate === '' ? null : new Date(`${fromDate}T00:00:00`).getTime()
    const toMs = toDate === '' ? null : new Date(`${toDate}T23:59:59.999`).getTime()
    return {
      from: fromMs === null ? now - 30 * DAY_MS : fromMs,
      to: toMs === null ? now : toMs,
    }
  }
  const days = preset === '7d' ? 7 : preset === '14d' ? 14 : 30
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return { from: start.getTime() - (days - 1) * DAY_MS, to: now }
}

function fmt(value: number): string {
  return value.toLocaleString()
}

/**
 * Render the usage-statistics body.
 * @param props - the locale seat and the load callback.
 * @returns the usage-statistics element tree.
 */
export function UsagePanel({ t, load }: UsagePanelProps): ReactNode {
  const [preset, setPreset] = useState<Preset>('7d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [nonce, setNonce] = useState(0)
  const [result, setResult] = useState<UsageReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const range = resolveRange(preset, customFrom, customTo)
    setLoading(true)
    load(range)
      .then((report) => { if (!cancelled) { setResult(report); setError(null) } })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [preset, customFrom, customTo, nonce, load])

  const maxDayTotal = result === null ? 1 : Math.max(1, ...result.byDay.map(day => day.total))

  const presets: Array<[Preset, string]> = [
    ['7d', t('presets.7d')],
    ['14d', t('presets.14d')],
    ['30d', t('presets.30d')],
    ['custom', t('presets.custom')],
  ]

  const cacheHitRate = (): number | undefined => {
    const totals = result?.totals
    if (totals === undefined) return undefined
    const totalInput = totals.input + totals.cacheRead
    if (totalInput <= 0) return undefined
    return (totals.cacheRead / totalInput) * 100
  }
  const percent = (value: number): string => `${value.toFixed(1)}%`
  // Token counts at or above 100 million render as an 亿 abbreviation; the
  // exact value stays available in the native title tooltip.
  const yiUnit = t('unit.yi')
  const fmtTokens = (value: number): string => {
    if (value < YI) return fmt(value)
    return `${Number((value / YI).toFixed(2))}${yiUnit}`
  }
  const cards: Array<{
    label: string
    value: number | undefined
    format?: (value: number) => string
    title?: (value: number) => string
  }> = [
    { label: t('totalTokens'), value: result?.totals.total, format: fmtTokens, title: fmt },
    { label: t('input'), value: result?.totals.input, format: fmtTokens, title: fmt },
    { label: t('output'), value: result?.totals.output, format: fmtTokens, title: fmt },
    { label: t('cacheHitRate'), value: cacheHitRate(), format: percent },
    { label: t('cacheRead'), value: result?.totals.cacheRead, format: fmtTokens, title: fmt },
    { label: t('cacheWrite'), value: result?.totals.cacheWrite, format: fmtTokens, title: fmt },
    { label: t('requests'), value: result?.totals.requests },
    { label: t('sessions'), value: result?.totals.sessions },
  ]

  return (
    <div className={css.section}>
      <div className={css.head}>
        <div className={css.title}>{t('title')}</div>
        <div className={css.subtitle}>{t('subtitle')}</div>
      </div>

      <div className={css.toolbar}>
        {presets.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={preset === id ? `${css.preset} ${css.presetActive}` : css.preset}
            onClick={() => { setPreset(id) }}
          >
            {label}
          </button>
        ))}
        {preset === 'custom' && (
          <>
            <input
              type="date"
              className={css.input}
              value={customFrom}
              onChange={(event) => { setCustomFrom(event.target.value) }}
            />
            <input
              type="date"
              className={css.input}
              value={customTo}
              onChange={(event) => { setCustomTo(event.target.value) }}
            />
          </>
        )}
        <button type="button" className={css.refresh} onClick={() => { setNonce(n => n + 1) }}>
          {t('refresh')}
        </button>
      </div>

      {loading && <div className={css.status}>{t('loading')}</div>}
      {error !== null && <div className={css.error}>{t('error')}: {error}</div>}

      <div className={css.cards}>
        {cards.map(({ label, value, format, title }) => (
          <div key={label} className={css.card}>
            <div className={css.cardLabel}>{label}</div>
            <div
              className={css.cardValue}
              title={value !== undefined && title !== undefined ? title(value) : undefined}
            >
              {value === undefined ? '—' : (format ?? fmt)(value)}
            </div>
          </div>
        ))}
      </div>

      <div className={css.block}>
        <div className={css.blockTitle}>{t('byDay')}</div>
        {result === null || result.byDay.length === 0
          ? <div className={css.empty}>{t('empty')}</div>
          : (
            <div className={css.days}>
              {result.byDay.map(day => (
                <div key={day.date} className={css.day}>
                  <span className={css.dayLabel}>{day.date}</span>
                  <div className={css.dayTrack}>
                    <div className={css.dayFill} style={{ width: `${Math.round((day.total / maxDayTotal) * 100)}%` }} />
                  </div>
                  <span className={css.dayValue} title={fmt(day.total)}>{fmtTokens(day.total)}</span>
                  <span className={css.dayMeta}>{fmt(day.requests)} {t('requests')}</span>
                </div>
              ))}
            </div>
          )}
      </div>

      <div className={css.block}>
        <div className={css.blockTitle}>{t('byModel')}</div>
        {result === null || result.byModel.length === 0
          ? <div className={css.empty}>{t('empty')}</div>
          : (
            <table className={css.table}>
              <thead>
                <tr>
                  <th>{t('model')}</th>
                  <th className={css.num}>{t('requests')}</th>
                  <th className={css.num}>{t('input')}</th>
                  <th className={css.num}>{t('output')}</th>
                  <th className={css.num}>{t('cacheRead')}</th>
                  <th className={css.num}>{t('total')}</th>
                </tr>
              </thead>
              <tbody>
                {result.byModel.map(row => (
                  <tr key={`${row.provider}/${row.model}`}>
                    <td className={css.modelCell} title={`${row.provider} / ${row.model}`}>{row.provider} / {row.model}</td>
                    <td className={css.num}>{fmt(row.requests)}</td>
                    <td className={css.num} title={fmt(row.input)}>{fmtTokens(row.input)}</td>
                    <td className={css.num} title={fmt(row.output)}>{fmtTokens(row.output)}</td>
                    <td className={css.num} title={fmt(row.cacheRead)}>{fmtTokens(row.cacheRead)}</td>
                    <td className={css.num} title={fmt(row.total)}>{fmtTokens(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  )
}

/** Localize the `session-usage` namespace key for the panel body. */
export type { UsageKey }
