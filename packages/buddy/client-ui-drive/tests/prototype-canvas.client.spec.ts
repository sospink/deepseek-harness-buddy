import { describe, expect, it } from 'vitest'
import { persistedCanvas } from '../src/client/PrototypeCanvas.tsx'

describe('prototype canvas persistence', () => {
  it('retains final artboard positions with viewport and overlay values', () => {
    const value = persistedCanvas([
      { id: 'home', position: { x: 176, y: 96 } },
      { id: 'users', position: { x: 2144, y: 1840 } },
    ], { x: 12, y: 24, zoom: 0.2 }, {
      title: '智御全城', accent: '#01E983', titleX: 48, titleY: 42,
      titleWidth: 460, titleHeight: 62, titleVisible: true,
    })
    expect(value).toMatchObject({
      positions: { home: { x: 176, y: 96 }, users: { x: 2144, y: 1840 } },
      viewport: { x: 12, y: 24, zoom: 0.2 }, title: '智御全城', accent: '#01E983',
    })
  })
})
