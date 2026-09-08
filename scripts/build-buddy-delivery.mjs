/** Build a Git-free Buddy customer source archive. */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const record = JSON.parse(readFileSync(resolve(root, '.buddy-delivery.json'), 'utf8'))
if (record.formatVersion !== 1 || typeof record.sourceSha256 !== 'string'
  || !/^[0-9a-f]{64}$/.test(record.sourceSha256)) {
  throw new Error('invalid Buddy delivery source record')
}

const result = spawnSync(process.execPath, ['--import', 'tsx/esm', 'scripts/build.ts'], {
  cwd: root,
  env: { ...process.env, DSH_CLIENT_COMMIT_HASH: record.sourceSha256.slice(0, 40) },
  stdio: 'inherit',
})
if (result.error !== undefined) throw result.error
if (result.status !== 0) process.exitCode = result.status ?? 1
