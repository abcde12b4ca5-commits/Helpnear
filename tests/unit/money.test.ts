import { describe, expect, it } from 'vitest'
import { MAX_CENTS, dollarsToCents, formatCents } from '../../src/lib/money'

describe('dollarsToCents', () => {
  it.each([
    ['0', 0], ['1', 100], ['12.5', 1250], ['12.50', 1250], ['0.99', 99], ['0.01', 1],
    ['$25', 2500], ['  $25.00  ', 2500], ['1,234.56', 123456], ['10000', MAX_CENTS], ['10000.00', MAX_CENTS],
  ])('accepts %j as %i cents', (input, cents) => {
    expect(dollarsToCents(input)).toBe(cents)
  })

  it.each([
    [''], ['   '], ['abc'], ['-5'], ['-0.01'], ['1.234'], ['1.'], ['.5'], ['1e3'], ['Infinity'], ['NaN'],
    ['10000.01'], ['10001'], ['99999999999'], ['$$5'], ['5 0'], ['1.2.3'], ['٥٠'],
  ])('rejects %j', (input) => {
    expect(dollarsToCents(input)).toBeNull()
  })

  it('has no floating point drift (19.99 and 0.07 style values)', () => {
    expect(dollarsToCents('19.99')).toBe(1999)
    expect(dollarsToCents('0.07')).toBe(7)
    expect(dollarsToCents('1.15')).toBe(115)
    expect(dollarsToCents('4.35')).toBe(435)
  })

  it('always returns a safe integer', () => {
    for (let c = 0; c <= 2000; c += 7) {
      const out = dollarsToCents((c / 100).toFixed(2))
      expect(Number.isInteger(out)).toBe(true)
      expect(out).toBe(c)
    }
  })
})

describe('formatCents', () => {
  it('formats US dollars', () => {
    expect(formatCents(0)).toBe('$0.00')
    expect(formatCents(1999)).toBe('$19.99')
    expect(formatCents(123456)).toBe('$1,234.56')
    expect(formatCents(MAX_CENTS)).toBe('$10,000.00')
  })
  it('shows a dash for missing values', () => {
    expect(formatCents(undefined)).toBe('-')
    expect(formatCents(null)).toBe('-')
  })
})
