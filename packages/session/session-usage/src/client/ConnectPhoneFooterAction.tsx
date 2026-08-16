/**
 * Sidebar footer Connect Phone action: a trigger row above the Usage
 * Statistics action that opens a popup minting a fresh mobile pairing link
 * (the dsh-remote-web-ui `/api/pair/issue` contract) for the user to open on
 * a phone. The popup is a fixed overlay panel in the same language as the
 * Usage Statistics popup, showing the link, a copy control, and expiry.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  IconCloseOutline16,
  IconCopyOutline16,
  IconLinkOutline16,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { NS } from './locales.ts'
import css from './ConnectPhoneFooterAction.module.css'

/** A fresh one-time mobile pairing link. */
export interface ConnectPhoneLink {
  url: string
  /** Epoch milliseconds after which the link stops pairing. */
  expiresAt: number
}

/** Registration-side business face for the footer action. */
export interface ConnectPhoneFooterActionInjected {
  /** Mint a fresh one-time mobile pairing link. */
  issue: () => Promise<ConnectPhoneLink>
}

/** Full component props: the sidebar footer-action owner share plus the face. */
export type ConnectPhoneFooterActionProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<typeof NS>
  & InjectFace<ConnectPhoneFooterActionInjected>

/** Pairing popup state: idle until first open, then loading/ready/error. */
type PairState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; url: string; expiresAt: number }
  | { status: 'error'; message: string }

/**
 * Render the sidebar footer trigger and the pairing popup it opens.
 * @param props - the wide/rail state, the locale seat, and the issue face.
 * @returns the footer action element tree.
 */
export function ConnectPhoneFooterAction({ wide, t, issue }: ConnectPhoneFooterActionProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [pair, setPair] = useState<PairState>({ status: 'idle' })
  const [copied, setCopied] = useState(false)
  const closeButton = useRef<HTMLButtonElement | null>(null)

  const mint = async (): Promise<void> => {
    setPair({ status: 'loading' })
    setCopied(false)
    try {
      const link = await issue()
      setPair({ status: 'ready', url: link.url, expiresAt: link.expiresAt })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setPair({ status: 'error', message })
    }
  }

  // Focus lands on the close button when the dialog opens (baseline
  // management, like Usage); Escape closes. Minting happens on the trigger
  // click, not here, so the effect stays free of render-scoped deps.
  useEffect(() => {
    if (!open) return
    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open])

  const toggle = (): void => {
    const next = !open
    setOpen(next)
    if (next && pair.status === 'idle') void mint()
  }

  const copy = async (): Promise<void> => {
    if (pair.status !== 'ready') return
    const accepted = await writeClipboard(pair.url)
    if (!accepted) return
    setCopied(true)
    window.setTimeout(() => { setCopied(false) }, 2000)
  }

  const expiryLabel = (): string => {
    if (pair.status !== 'ready' || pair.expiresAt <= 0) return ''
    const time = new Date(pair.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return t('connect.expires', { time })
  }

  return (
    <div className={wide ? css.layer : `${css.layer} ${css.rail}`}>
      {open && (
        <div className={css.overlay} role="presentation">
          <div className={css.mask} aria-hidden="true" onClick={() => { setOpen(false) }} />
          <div className={css.panel} role="dialog" aria-modal="true" aria-label={t('connect.title')}>
            <header className={css.header}>
              <span className={css.title}>{t('connect.title')}</span>
              <button
                ref={closeButton}
                type="button"
                className={css.close}
                aria-label={t('connect.close')}
                onClick={() => { setOpen(false) }}
              >
                <IconCloseOutline16 size={14} />
              </button>
            </header>
            <div className={css.body}>
              <p className={css.subtitle}>{t('connect.subtitle')}</p>
              {pair.status === 'loading' && <p className={css.stateLine}>{t('connect.loading')}</p>}
              {pair.status === 'ready' && (
                <>
                  <div className={css.linkCard}>
                    <span className={css.linkText}>{pair.url}</span>
                    <button type="button" className={css.copy} aria-label={t('connect.copy')} onClick={() => void copy()}>
                      <IconCopyOutline16 size={14} />
                      {copied ? t('connect.copied') : t('connect.copy')}
                    </button>
                  </div>
                  <p className={css.hint}>{t('connect.hint')}</p>
                  <p className={css.publicHint}>{t('connect.publicHint')}</p>
                  {expiryLabel() !== '' && <p className={css.expiry}>{expiryLabel()}</p>}
                  <button type="button" className={css.refresh} onClick={() => void mint()}>
                    {t('connect.refresh')}
                  </button>
                </>
              )}
              {pair.status === 'error' && (
                <>
                  <p className={css.error}>{t('connect.error', { error: pair.message })}</p>
                  <p className={css.hint}>{t('connect.unavailable')}</p>
                  <button type="button" className={css.refresh} onClick={() => void mint()}>
                    {t('connect.refresh')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <button
        type="button"
        className={css.trigger}
        aria-label={t('connect.nav')}
        aria-expanded={open}
        onClick={toggle}
      >
        <IconLinkOutline16 size={wide ? 16 : 18} />
        {wide && <span className={css.triggerLabel}>{t('connect.nav')}</span>}
      </button>
    </div>
  )
}
