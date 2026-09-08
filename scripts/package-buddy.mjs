/** Create a clean customer source archive for the Buddy application. */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destination = join(root, 'dist-delivery')
const macPackageName = '低空安全Agent-macOS-source'
// Keep every archive entry ASCII so Explorer and older Windows ZIP handlers
// do not depend on a UTF-8 filename flag. The user-facing ZIP name stays Chinese.
const windowsPackageName = 'LowAltitudeSafetyAgent-Windows-source'
const windowsArchiveName = '低空安全Agent-Windows-source'

const excludedPrefixes = [
  '.github/',
  '.playwright-cli/',
  'output/',
  'prototype-assets/',
  'snapshots/',
]

function included(path) {
  if (path === '.env' || path === 'CLAUDE.local.md') return false
  if (path === 'CLAUDE.md' || path.endsWith('/CLAUDE.md')) return false
  if (path.split('/').some(segment => segment === '.agents' || segment === '.claude')) return false
  return !excludedPrefixes.some(prefix => path.startsWith(prefix))
}

function copyEntry(relative, staging, materializeSymlinks = false) {
  const source = join(root, relative)
  const target = join(staging, relative)
  mkdirSync(dirname(target), { recursive: true })
  const stat = lstatSync(source)
  if (stat.isSymbolicLink()) {
    if (materializeSymlinks) cpSync(realpathSync(source), target, { force: true, preserveTimestamps: true })
    else symlinkSync(readlinkSync(source), target)
    return
  }
  cpSync(source, target, { force: true, preserveTimestamps: true })
}

function checksumFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function prepareStaging(packageName, materializeSymlinks, sourceSha256) {
  const staging = join(destination, packageName)
  if (existsSync(staging)) rmSync(staging, { recursive: true })
  for (const relative of listed) copyEntry(relative, staging, materializeSymlinks)

  writeFileSync(join(staging, '.buddy-delivery.json'), `${JSON.stringify({ formatVersion: 1, sourceSha256 }, null, 2)}\n`)
  const manifestPath = join(staging, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.scripts.build = 'node scripts/build-buddy-delivery.mjs'
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return staging
}

mkdirSync(destination, { recursive: true })

const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: root,
  encoding: 'utf8',
}).split('\0').filter(Boolean).filter(included)

const sourceDigest = createHash('sha256')
for (const relative of listed.sort()) {
  sourceDigest.update(relative)
  sourceDigest.update('\0')
  const source = join(root, relative)
  const stat = lstatSync(source)
  sourceDigest.update(stat.isSymbolicLink() ? readlinkSync(source) : readFileSync(source))
  sourceDigest.update('\0')
}
const sourceSha256 = sourceDigest.digest('hex')

const macStaging = prepareStaging(macPackageName, false, sourceSha256)
writeFileSync(join(macStaging, '交付包说明.txt'), [
  '低空安全Agent 客户交付源码包',
  '',
  '首次部署：',
  '1. corepack pnpm install --frozen-lockfile',
  '2. corepack pnpm run build',
  '3. corepack pnpm start:buddy -- --no-open',
  '',
  '后续启动：corepack pnpm start:buddy -- --no-open',
  '访问地址：http://127.0.0.1:3080/',
  '完整说明：本地启动说明.md',
  '',
  '本压缩包不包含开发机 API Key、会话、资料云盘数据、node_modules 或构建缓存。',
  `源码指纹：${sourceSha256}`,
].join('\n'))

const macArchive = join(destination, `${macPackageName}.tar.gz`)
const macChecksum = `${macArchive}.sha256`
if (existsSync(macArchive)) rmSync(macArchive)
if (existsSync(macChecksum)) rmSync(macChecksum)
execFileSync('tar', ['-czf', macArchive, '-C', destination, basename(macStaging)], { cwd: root, stdio: 'inherit' })
writeFileSync(macChecksum, `${checksumFile(macArchive)}  ${basename(macArchive)}\n`)
rmSync(macStaging, { recursive: true })

const windowsStaging = prepareStaging(windowsPackageName, true, sourceSha256)
renameSync(join(windowsStaging, '本地启动说明.md'), join(windowsStaging, 'DELIVERY-GUIDE.zh-CN.md'))
writeFileSync(join(windowsStaging, 'README-Windows.txt'), [
  '低空安全Agent Windows 客户交付源码包',
  '',
  '系统要求：Windows 10/11 64 位、Node.js 22 LTS（22.19.0 或更高）。',
  '请把整个目录解压到短路径，例如 C:\\buddy；不要在 ZIP 内直接运行。',
  '',
  '首次部署（在 PowerShell 中进入本目录后执行）：',
  '1. corepack enable',
  '2. corepack pnpm install --frozen-lockfile',
  '3. corepack pnpm run build',
  '4. corepack pnpm start:buddy -- --no-open',
  '',
  '后续启动：corepack pnpm start:buddy -- --no-open',
  '也可以双击 Start-LowAltitudeSafetyAgent.cmd。',
  '访问地址：http://127.0.0.1:3080/',
  '完整说明：DELIVERY-GUIDE.zh-CN.md',
  '',
  '本压缩包不包含开发机 API Key、会话、资料云盘数据、node_modules 或构建缓存。',
  `源码指纹：${sourceSha256}`,
].join('\r\n'))
writeFileSync(join(windowsStaging, 'Start-LowAltitudeSafetyAgent.cmd'), [
  '@echo off',
  'chcp 65001 >nul',
  'cd /d "%~dp0"',
  'corepack pnpm start:buddy -- --no-open',
  'if errorlevel 1 pause',
].join('\r\n'))

const windowsArchive = join(destination, `${windowsArchiveName}.zip`)
const windowsChecksum = `${windowsArchive}.sha256`
if (existsSync(windowsArchive)) rmSync(windowsArchive)
if (existsSync(windowsChecksum)) rmSync(windowsChecksum)
execFileSync('zip', ['-qr', windowsArchive, basename(windowsStaging)], { cwd: destination, stdio: 'inherit' })
writeFileSync(windowsChecksum, `${checksumFile(windowsArchive)}  ${basename(windowsArchive)}\n`)
rmSync(windowsStaging, { recursive: true })

for (const path of [macArchive, macChecksum, windowsArchive, windowsChecksum]) console.log(path)
