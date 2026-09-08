// The composer remains in ConversationRoot so switching out of the blank-draft
// phase does not remount its textarea.

import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import {
  LowAltitudeSafetyLogo, IconAgentPresetOutline16, IconChevronDownOutline14,
  IconCodeOutline16, IconFolderClose16, IconFolderOpen16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { workspaceTitleOf } from '@deepseek-ai/dsh-util-workspace-path'
import type { ConversationSlotProps } from '../contract/slots.ts'
import css from './HeroShell.module.css'
import landing from './WelcomeLanding.module.css'

/** The owner's locale seat type, passed to hero chrome as a plain prop. */
type HeroTranslate = ConversationSlotProps['t']

/**
 * Basename label for the workspace chip (the shared derivation);
 * separator-only paths echo the raw cwd.
 * @param cwd - workspace directory path (non-empty).
 * @returns chip label.
 */
export function workspaceLabel(cwd: string): string {
  const base = workspaceTitleOf(cwd)
  return base !== '' ? base : cwd
}

/**
 * The workspace chip (folder + label + chevron), always interactive: before
 * the first message the workspace stays switchable — picking another one
 * moves the New Session flow to that workspace's blank session. Without a
 * label the chip renders its placeholder state: closed folder + the
 * "Choose workspace" call to action.
 * @param props.label - chip label (see {@link workspaceLabel}); omitted → placeholder.
 * @param props.menuOpen - menu expansion echo.
 * @param props.onClick - menu toggle.
 * @returns the chip button element.
 */
export function WorkspaceChip({ buttonRef, label, menuOpen = false, onClick, t }: {
  buttonRef?: RefObject<HTMLButtonElement>
  label?: string | undefined
  menuOpen?: boolean
  onClick?: () => void
  t: HeroTranslate
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={css.workspace}
      aria-label={t('hero.chooseWorkspace')}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      onClick={onClick}
    >
      {label === undefined
        ? <IconFolderClose16 className={css.folder} size={16} />
        : <IconFolderOpen16 className={css.folder} size={16} />}
      <span className={css.workspaceLabel}>{label ?? t('hero.chooseWorkspace')}</span>
      <IconChevronDownOutline14 className={css.chevron} size={12} />
    </button>
  )
}

/**
 * The soft blue backdrop ellipse (figma 313:14109). Rendered by the hero
 * owner (ConversationRoot), not HeroShell, so it can center on the input
 * card; the owner's className supplies all positioning.
 * @param props.className - positioning class from the owner.
 * @returns the blurred-ellipse svg element.
 */
export function HeroGlow({ className }: { className?: string | undefined }) {
  // Stable filter id so multiple hero mounts do not collide in the DOM.
  const glowFilterId = `empty-glow-${useId().replace(/:/g, '')}`
  return (
    <svg className={className} viewBox="0 0 1051 468" fill="none" aria-hidden="true">
      <defs>
        <filter
          id={glowFilterId}
          x="0"
          y="0"
          width="1051"
          height="468"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="50" result="effect1_foregroundBlur" />
        </filter>
      </defs>
      <g filter={`url(#${glowFilterId})`}>
        <ellipse cx="525.5" cy="234" rx="425.5" ry="134" fill="#6187D8" fillOpacity="0.08" />
      </g>
    </svg>
  )
}

/** Hero chrome props. The workspace row rides the InputBar accessory hole, not here. */
export interface HeroShellProps {
  /** The owner's locale seat, passed down as a plain prop. */
  t: HeroTranslate
  /** Authorized renderer for the hero brand-mark slot. */
  renderSlot: ConversationSlotProps['renderSlot']
  /** Leave the cinematic welcome surface and reveal the resident composer. */
  onGetStarted?: (() => void) | undefined
  /** Overlay content after the stack (modals). */
  children?: ReactNode
}

/**
 * Render the hero chrome (headline only; no glow, no composer, no workspace
 * row — the glow is the owner's {@link HeroGlow}).
 * @param props - see {@link HeroShellProps}.
 * @returns the centered hero element tree.
 */
const STATS = [
  { glyph: '<', target: 120, suffix: 'ms', decimals: 0, label: 'welcome.stat.inference' },
  { glyph: '%', target: 99.99, suffix: '%', decimals: 2, label: 'welcome.stat.uptime' },
  { glyph: '*', target: 24, suffix: '/7', decimals: 0, label: 'welcome.stat.runtime' },
  { glyph: '#', target: 2.4, suffix: 'M', decimals: 1, label: 'welcome.stat.context' },
] as const

/** Animated stat value that starts when the footer enters the viewport. */
function CountUp({ target, suffix, decimals, index }: (typeof STATS)[number] & { index: number }) {
  const [value, setValue] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const node = ref.current
    const reducedMotion = typeof matchMedia !== 'undefined'
      && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (node === null || reducedMotion) {
      setValue(target)
      return
    }
    let frame = 0
    let timer = 0
    let started = false
    const begin = () => {
      if (started) return
      started = true
      timer = window.setTimeout(() => {
        const start = performance.now()
        const duration = 1500 + index * 80
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / duration)
          setValue(target * (1 - (1 - progress) ** 3))
          if (progress < 1) frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
      }, 480 + index * 90)
    }
    const observer = typeof IntersectionObserver === 'undefined'
      ? undefined
      : new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) { begin(); observer?.disconnect() } }, { threshold: 0.25 })
    if (observer === undefined) begin()
    else observer.observe(node)
    return () => {
      observer?.disconnect()
      clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
  }, [decimals, index, target])

  return <span ref={ref}>{value.toFixed(decimals)}{suffix}</span>
}

/** Single-viewport video landing page used by the blank-session shell. */
export function HeroShell({ t, renderSlot, onGetStarted, children }: HeroShellProps) {
  const start = () => {
    onGetStarted?.()
  }

  return (
    <section className={landing.page} data-welcome-landing="" aria-label={t('welcome.aria')}>
      <div className={landing.bg} aria-hidden="true">
        <video className={landing.bgVideo} autoPlay muted loop playsInline poster="/welcome-background.jpg">
          <source src="/welcome-background.mp4" type="video/mp4" />
        </video>
      </div>

      <header className={landing.header}>
        <div className={landing.logo} aria-hidden="true">
          {renderSlot('conversation.hero.brand.mark', { size: 52, className: landing.logoMark }, {
            fallback: <LowAltitudeSafetyLogo size={52} className={landing.logoMark} />,
          })}
        </div>
        <p className={landing.platformLabel}>{t('welcome.platformLabel')}</p>
        <button className={landing.signIn} type="button" onClick={start}>{t('welcome.signIn')}</button>
      </header>

      <main className={landing.hero}>
        <div className={`${landing.trust} ${landing.anim}`} style={{ '--d': '0.05s' } as CSSProperties}>
          <div className={landing.avatars} aria-hidden="true">
            <span><LowAltitudeSafetyLogo size={18} /></span>
            <span><IconAgentPresetOutline16 size={18} /></span>
            <span><IconCodeOutline16 size={18} /></span>
          </div>
          <span className={landing.trustPill}>{t('welcome.trusted')}</span>
        </div>

        <h1 className={landing.headline}>
          <span>{t('welcome.headline.one')}</span>
          <span>{t('welcome.headline.two')}</span>
        </h1>
        <p className={`${landing.subhead} ${landing.anim}`} style={{ '--d': '0.28s' } as CSSProperties}>
          {t('welcome.subhead')}
        </p>
        <button
          type="button"
          className={`${landing.cta} ${landing.anim}`}
          style={{ '--d': '0.4s' } as CSSProperties}
          onClick={start}
        >
          {t('welcome.getStarted')}
        </button>
      </main>

      <footer className={landing.stats} aria-label={t('welcome.stats')}>
        {STATS.map((stat, index) => (
          <div key={stat.label} className={`${landing.stat} ${landing.anim}`} style={{ '--d': `${0.5 + index * 0.08}s` } as CSSProperties}>
            <span className={landing.statGlyph}>{stat.glyph}</span>
            <strong><CountUp {...stat} index={index} /></strong>
            <small>{t(stat.label)}</small>
          </div>
        ))}
      </footer>

      {children}
    </section>
  )
}
