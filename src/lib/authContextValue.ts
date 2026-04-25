import { createContext } from 'react'
import type { AuthState } from './auth'
import type { SyncEvent } from './sync'

export interface AuthContextValue {
  auth: AuthState | null
  configured: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  sync: SyncEvent
}

export const AuthContext = createContext<AuthContextValue | null>(null)
