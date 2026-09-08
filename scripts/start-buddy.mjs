import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const home = resolve(root, '.harness-buddy-home')
const bin = resolve(root, 'apps/cli/src/bin.ts')
const patch = resolve(root, 'packages/buddy/drive-app/cordis.patch.yml')
const presetRoot = resolve(root, 'packages/buddy/tool-drive/presets')

const appArgs = process.argv.slice(2)
if (appArgs[0] === '--') appArgs.shift()

const child = spawn(process.execPath, ['--import', 'tsx/esm', bin, 'web', '--patch', patch, ...appArgs], {
  cwd: root,
  env: { ...process.env, DSH_HOME: home, DSH_BUDDY_PRESET_ROOT: presetRoot },
  stdio: 'inherit',
})

child.on('error', error => {
  console.error(`无法启动低空安全Agent：${error.message}`)
  process.exitCode = 1
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exitCode = code ?? 1
})
