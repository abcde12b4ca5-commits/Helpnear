export interface CspInput {
  workerUrl?: string
  authDomain?: string
  projectId?: string
  useEmulators?: boolean
  scriptHashes?: string[]
  styleHashes?: string[]
}
export function buildCsp(input?: CspInput): string
