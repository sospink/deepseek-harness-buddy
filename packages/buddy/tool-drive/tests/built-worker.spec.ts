import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
const workerPath = join(root, 'lib/worker.cjs')

describe.skipIf(!existsSync(workerPath))('built Buddy Drive extraction Worker', () => {
  it('runs the self-contained CJS Worker through plain Node', async () => {
    const require = createRequire(import.meta.url)
    const mammothRoot = dirname(require.resolve('mammoth/package.json'))
    const data = readFileSync(join(mammothRoot, 'test/test-data/single-paragraph.docx'))
    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    const result = await new Promise<unknown>((resolve, reject) => {
      const worker = new Worker(workerPath, {
        workerData: {
          mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer,
          maxTextBytes: 4096,
        },
        transferList: [buffer], env: {}, execArgv: [],
      })
      worker.once('message', resolve)
      worker.once('error', reject)
    })
    expect(result).toMatchObject({ ok: true, text: expect.stringContaining('Walking on imported air') })
  })
})
