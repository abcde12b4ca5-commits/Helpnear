import type { ClaimDoc } from './types'

/** Plain-language state of one worker on one request, written for the person looking at it. */
export function claimLabel(c: ClaimDoc, viewer: 'worker' | 'client'): string {
  switch (c.status) {
    case 'accepted':
      if (!c.clientAgreed) return viewer === 'client' ? 'Accepted by worker. Review the price and agree to start.' : 'Accepted. Waiting for the client to agree to your price.'
      return viewer === 'client' ? 'Price agreed. Work in progress.' : 'Price agreed. Do the work, then mark it done.'
    case 'done': return viewer === 'client' ? 'Worker says the service is done. Please confirm.' : 'Marked done. Waiting for the client to confirm.'
    case 'confirmed': return 'Service done and confirmed.'
    case 'cancelled': return `Cancelled by ${c.cancelledBy === 'system' ? 'the system' : `the ${c.cancelledBy ?? 'other side'}`}${c.cancelReason ? `: ${c.cancelReason}` : ''}`
    case 'disputed': return 'Under admin review. An admin will decide and both sides are told.'
    case 'voided': return 'Removed by an admin.'
  }
}
