import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'

const root = fileURLToPath(new URL('..', import.meta.url))

describe('Buddy Drive application bundle', () => {
  it('declares one patch with the complete ordered Buddy stack and private storage root', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    const patches = loadOverlayPatches('buddy-drive-app', resolve(root, 'cordis.patch.yml'))
    expect(patches).toHaveLength(4)
    expect(patches[1]).toMatchObject({
      id: 'connection',
      name: '@deepseek-ai/dsh-client-connection',
      config: { allowUnauthenticatedLoopback: true },
    })
    const rows = patches[2]?.insert ?? []
    expect(rows.map(row => [row.id, row.name])).toEqual([
      ['buddy-drive-local', '@sospink/dsh-buddy-drive-local'],
      ['buddy-api-drive', '@sospink/dsh-buddy-api-drive'],
      ['buddy-agent-role', '@sospink/dsh-buddy-agent-role'],
      ['buddy-client-ui-drive', '@sospink/dsh-buddy-client-ui-drive'],
      ['buddy-client-ui-agent-role', '@sospink/dsh-buddy-client-ui-agent-role'],
    ])
    expect(rows[0]?.config).toMatchObject({
      root: { __jsExpr: "dshHomePath('buddy-drive')" },
      maxFileBytes: 52_428_800,
      maxLibraryBytes: 2_147_483_648,
    })
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual([
      ...rows.map(row => row.name), '@deepseek-ai/dsh-agent-presets', '@sospink/dsh-buddy-tool-drive',
    ].sort())
    expect(patches[3]).toMatchObject({
      id: 'agent-presets',
      name: '@deepseek-ai/dsh-agent-presets',
      config: {
        default: 'standard', includeShippedRoot: true, includeUserRoot: true,
        roots: [{ trust: 'system' }],
      },
    })
    const rootExpression = (patches[3]?.config as { roots?: Array<{ path?: { __jsExpr?: string } }> })
      .roots?.[0]?.path?.__jsExpr
    expect(rootExpression).toContain('DSH_BUDDY_PRESET_ROOT')
  })
})
