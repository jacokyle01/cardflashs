import { createContext } from 'react'
import type { ApiFetch, AuthState } from './auth'
import type { SyncEvent } from './sync'

export interface AuthContextValue {
  auth: AuthState | null
  configured: boolean
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  signOut: () => Promise<void>
  sync: SyncEvent
  // Authenticated fetch against the token-exchange API (/api/*). Null when
  // signed out.
  apiFetch: ApiFetch | null
}

export const AuthContext = createContext<AuthContextValue | null>(null)
