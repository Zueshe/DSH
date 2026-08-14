/**
 * Sidebar footer Usage Statistics action: a trigger row under the browsing
 * region (above the Settings seat) that opens an independent popup rendering
 * the shared {@link UsagePanel} body. The popup is a fixed overlay panel,
 * not the settings modal, so usage is one click away from any surface.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IconCloseOutline16, IconDataOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { NS } from './locales.ts'
import { UsagePanel, type UsagePanelFace } from './UsagePanel.tsx'
import css from './UsageFooterAction.module.css'

/** Registration-side business face for the footer action. */
export interface UsageFooterActionInjected extends UsagePanelFace {}

/** Full component props: the sidebar footer-action owner share plus the face. */
export type UsageFooterActionProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<typeof NS>
  & InjectFace<UsageFooterActionInjected>

/**
 * Render the sidebar footer trigger and the popup it opens.
 * @param props - the wide/rail state, the locale seat, and the load face.
 * @returns the footer action element tree.
 */
export function UsageFooterAction({ wide, t, load }: UsageFooterActionProps): ReactNode {
  const [open, setOpen] = useState(false)
  const closeButton = useRef<HTMLButtonElement | null>(null)

  // Escape closes the popup; the listener lives only while it is open. Focus
  // lands on the close button when the dialog opens (baseline management).
  useEffect(() => {
    if (!open) return
    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open])

  return (
    <div className={wide ? css.layer : `${css.layer} ${css.rail}`}>
      {open && (
        <div className={css.overlay} role="presentation">
          <div className={css.mask} aria-hidden="true" onClick={() => { setOpen(false) }} />
          <div className={css.panel} role="dialog" aria-modal="true" aria-label={t('title')}>
            <header className={css.header}>
              <span className={css.title}>{t('title')}</span>
              <button
                ref={closeButton}
                type="button"
                className={css.close}
                aria-label={t('footer.close')}
                onClick={() => { setOpen(false) }}
              >
                <IconCloseOutline16 size={14} />
              </button>
            </header>
            <div className={css.body}>
              <UsagePanel t={t} load={load} />
            </div>
          </div>
        </div>
      )}
      <button
        type="button"
        className={css.trigger}
        aria-label={t('nav')}
        aria-expanded={open}
        onClick={() => { setOpen(value => !value) }}
      >
        <IconDataOutline16 size={wide ? 16 : 18} />
        {wide && <span className={css.triggerLabel}>{t('nav')}</span>}
      </button>
    </div>
  )
}
