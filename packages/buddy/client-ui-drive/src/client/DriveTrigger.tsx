import clsx from 'clsx'
import { IconDataOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { BuddyDriveClient } from './service.ts'
import css from './DriveTrigger.module.css'

export interface DriveUiInjected { readonly client: BuddyDriveClient }
export type DriveTriggerProps = PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'buddy-drive'> & InjectFace<DriveUiInjected>

/** Sidebar entry for the standalone Drive application surface. */
export function DriveTrigger({ wide, client, t }: DriveTriggerProps) {
  const control = (
    <button
      type="button"
      className={clsx(css.trigger, !wide && css.rail)}
      aria-label={t('trigger')}
      onClick={(event) => {
        client.open(event.currentTarget)
        void client.refresh().catch((error: unknown) => { client.failed(error) })
      }}
    >
      <IconDataOutline16 size={wide ? 16 : 18} />
      {wide && <span className={css.label}>{t('trigger')}</span>}
    </button>
  )
  return wide ? control : <Tooltip label={t('trigger')} side="right" delayMs={500}>{control}</Tooltip>
}
