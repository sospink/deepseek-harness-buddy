import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'

const root = fileURLToPath(new URL('..', import.meta.url))

describe('Buddy Drive application bundle', () => {
  it('declares one patch with the complete ordered Drive stack and private storage root', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    const patches = loadOverlayPatches('buddy-drive-app', resolve(root, 'cordis.patch.yml'))
    expect(patches).toHaveLength(1)
    const rows = patches[0]?.insert ?? []
    expect(rows.map(row => [row.id, row.name])).toEqual([
      ['buddy-drive-local', '@sospink/dsh-buddy-drive-local'],
      ['buddy-api-drive', '@sospink/dsh-buddy-api-drive'],
      ['buddy-client-ui-drive', '@sospink/dsh-buddy-client-ui-drive'],
    ])
    expect(rows[0]?.config).toMatchObject({
      root: { __jsExpr: "dshHomePath('buddy-drive')" },
      maxFileBytes: 52_428_800,
      maxLibraryBytes: 2_147_483_648,
    })
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(
      rows.map(row => row.name).sort(),
    )
  })
})
