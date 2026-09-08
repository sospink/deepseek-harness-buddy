/** Professional-role picker in the new-session Hero tool group. */

import { useEffect, useRef, useState } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  IconChevronDownOutline14, IconUserOutline16, IconWarningOutline16, Menu, Toast,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { AgentRoleId } from '@sospink/dsh-buddy-agent-role/types'
import { roleKeys, type AgentRoleKey } from './locales.ts'
import type { AgentRoleSeatState } from './store.ts'
import css from './AgentRoleSeat.module.css'

/** Registration-side behavior supplied to the role picker. */
export interface AgentRoleSeatInjected {
  hooks: { agentRoleSeat: SnapshotStore<AgentRoleSeatState> }
  sync: () => void
  select: (role: AgentRoleId) => Promise<string | undefined>
}

export type AgentRoleSeatProps =
  PropsRuntime<'conversation.hero.agentRole'>
  & PropsLocale<'buddy.agentRole'>
  & InjectFace<AgentRoleSeatInjected>

const PRODUCT_ROLES: readonly AgentRoleId[] = [
  'general', 'business-requirements-analyst', 'product-solution-designer', 'prototype-designer',
]
const TECHNOLOGY_ROLES: readonly AgentRoleId[] = [
  'software-architect', 'ai-application-engineer', 'blockchain-engineer',
]
const QUALITY_ROLES: readonly AgentRoleId[] = ['code-review-expert']

function roleItem(role: AgentRoleId, t: (key: AgentRoleKey) => string): MenuEntry {
  const keys = roleKeys(role)
  return {
    id: role,
    label: (
      <span className={css.item}>
        <span className={css.itemName}>{t(keys.name)}</span>
        <span className={css.itemDesc}>{t(keys.description)}</span>
      </span>
    ),
  }
}

/** Render the grouped, single-select role control. */
export function AgentRoleSeat({ useAgentRoleSeat, sync, select, t }: AgentRoleSeatProps) {
  const state = useAgentRoleSeat(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  const toastSeq = useRef(0)
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const currentKeys = roleKeys(state.current)

  useEffect(() => { sync() }, [sync])

  const items: MenuEntry[] = [
    { type: 'label', id: 'product', text: t('productGroup') },
    ...PRODUCT_ROLES.map(role => roleItem(role, t)),
    { type: 'separator', id: 'technology-separator' },
    { type: 'label', id: 'technology', text: t('technologyGroup') },
    ...TECHNOLOGY_ROLES.map(role => roleItem(role, t)),
    { type: 'separator', id: 'quality-separator' },
    { type: 'label', id: 'quality', text: t('qualityGroup') },
    ...QUALITY_ROLES.map(role => roleItem(role, t)),
  ]

  return (
    <>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={items}
        selectedId={state.current}
        onSelect={(id) => {
          setOpen(false)
          const role = id as AgentRoleId
          const name = t(roleKeys(role).name)
          void select(role).then((refusal) => {
            if (refusal === undefined) return
            toastSeq.current += 1
            setToast({
              seq: toastSeq.current,
              text: t('switchRefused').replace('{name}', name).replace('{reason}', refusal),
            })
          })
        }}
        align="start"
        portal
        anchor={(
          <button
            type="button"
            className={css.seat}
            aria-haspopup="menu"
            aria-expanded={open}
            title={state.error ?? t('hint')}
            disabled={state.busy}
            onClick={() => { setOpen(value => !value) }}
          >
            <IconUserOutline16 className={css.icon} />
            <span className={css.label}>{t(currentKeys.name)}</span>
            <IconChevronDownOutline14 className={css.chevron} />
          </button>
        )}
      />
      {toast !== null && (
        <Toast
          key={toast.seq}
          text={toast.text}
          icon={<IconWarningOutline16 />}
          holdMs={7000}
          anchor={document.querySelector<HTMLElement>('[data-composer-card]')}
          onDone={() => { setToast(null) }}
        />
      )}
    </>
  )
}
