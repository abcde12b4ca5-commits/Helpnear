/** Money is stored as integer cents so sums are exact. */
export const MAX_CENTS = 1_000_000 // $10,000.00, keep in sync with firestore.rules

export function dollarsToCents(input: string): number | null {
  const t = input.trim().replace(/^\$/, '').replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const cents = Math.round(Number(t) * 100)
  return cents >= 0 && cents <= MAX_CENTS ? cents : null
}

export const formatCents = (cents: number | undefined | null): string =>
  cents == null ? '-' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
