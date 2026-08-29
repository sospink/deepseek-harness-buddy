import type { UserConfig } from 'tsdown'
import { clientBundle } from '../../client/tsdown.client.ts'

const bundle = clientBundle('@sospink/dsh-buddy-client-ui-drive', ['lib/types/index.js', 'lib/types/invariant.js'])

/** Dynamic format runtimes must remain inside the one artifact the Harness plugin server owns. */
export default (inlineConfig: Pick<UserConfig, 'env'>): UserConfig[] => bundle(inlineConfig).map(config => (
  config.name === '@sospink/dsh-buddy-client-ui-drive/client'
    ? { ...config, outputOptions: { ...config.outputOptions, codeSplitting: false } }
    : config
))
