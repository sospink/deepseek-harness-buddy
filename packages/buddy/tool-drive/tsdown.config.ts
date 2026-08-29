import { defineConfig } from 'tsdown'

/** Build the Host Consumer and extraction Worker as separate self-contained entries. */
export default defineConfig([
  {
    entry: ['lib/types/index.js', 'lib/types/invariant.js', 'lib/types/policy.js'],
    outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024',
    fixedExtension: false, dts: false, clean: false,
  },
  {
    entry: ['lib/types/worker.js'],
    outDir: 'lib', format: ['cjs'], platform: 'node', target: 'es2024',
    fixedExtension: false, dts: false, clean: false,
    outputOptions: { codeSplitting: false },
  },
])
