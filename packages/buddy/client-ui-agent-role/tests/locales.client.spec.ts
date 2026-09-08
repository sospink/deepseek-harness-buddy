import { describe, expect, it } from 'vitest'
import { en, roleKeys, zh } from '../src/client/locales.ts'

describe('professional-role copy', () => {
  it('publishes every requested role in both locales', () => {
    for (const role of [
      'general', 'business-requirements-analyst', 'product-solution-designer',
      'prototype-designer', 'software-architect', 'ai-application-engineer',
      'blockchain-engineer', 'code-review-expert',
    ] as const) {
      const keys = roleKeys(role)
      expect(zh[keys.name]).toBeTruthy()
      expect(zh[keys.description]).toBeTruthy()
      expect(en[keys.name]).toBeTruthy()
      expect(en[keys.description]).toBeTruthy()
    }
  })
})
