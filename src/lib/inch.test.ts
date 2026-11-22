import { describe, expect, it } from 'vitest'
import { fmtDia, fmtInch, mmToNominalInch, parseInch } from './inch'

describe('inci', () => {
  it('format pecahan', () => {
    expect([0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 4, 0.125].map(fmtInch)).toEqual(['1/2', '3/4', '1', '1 1/4', '1 1/2', '2', '2 1/2', '4', '1/8'])
    expect(fmtDia(0.75)).toBe('Ø3/4"')
    expect(fmtInch(2.33)).toBe('2,33')
  })
  it('baca berbagai tulisan', () => {
    expect(parseInch('3/4')).toBe(0.75)
    expect(parseInch('1 1/2')).toBe(1.5)
    expect(parseInch('1-1/2')).toBe(1.5)
    expect(parseInch('2"')).toBe(2)
    expect(parseInch('2,5')).toBe(2.5)
    expect(parseInch('4 inci')).toBe(4)
  })
  it('menolak input salah', () => {
    for (const bad of ['', 'abc', '0', '-1', '1/0', '1 1/0']) expect(parseInch(bad)).toBeNull()
  })
  it('mm ke inci nominal', () => {
    expect([63, 110, 160, 50, 75].map(mmToNominalInch)).toEqual([2, 4, 6, 1.5, 2.5])
  })
})
