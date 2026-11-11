import { FirebaseError } from 'firebase/app'

export function friendlyError(e: unknown): string {
  if (e instanceof FirebaseError) {
    switch (e.code) {
      case 'auth/email-already-in-use': return 'An account with this email already exists.'
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found': return 'Incorrect email or password.'
      case 'auth/weak-password': return 'Password must be at least 8 characters.'
      case 'auth/too-many-requests': return 'Too many attempts. Please wait a few minutes and try again.'
      case 'auth/network-request-failed': return 'Network error. Check your connection and try again.'
      case 'permission-denied': return 'Not allowed. Check that your email is verified, wait a minute between posts, and try again.'
      case 'resource-exhausted': return 'The service is busy right now. Please try again later.'
      case 'unavailable': return 'Service temporarily unavailable. Please try again.'
      default: return 'Something went wrong. Please try again.'
    }
  }
  return e instanceof Error ? e.message : 'Something went wrong. Please try again.'
}
