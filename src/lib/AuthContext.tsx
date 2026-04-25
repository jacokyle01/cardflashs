import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type AuthState,
  clearAuth,
  decodeJWT,
  getGoogleAccountsId,
  isTokenValid,
  loadStoredAuth,
  storeAuth,
} from './auth'
import { AuthContext, type AuthContextValue } from './authContextValue'
import { startSync, stopSync, subscribeSyncStatus, type SyncEvent, updateSyncToken } from './sync'

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? ''

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(() => loadStoredAuth())
  const [sync, setSync] = useState<SyncEvent>({ status: 'idle' })
  const initializedRef = useRef(false)

  const applyAuth = useCallback(async (next: AuthState | null) => {
    setAuth(next)
    if (next) {
      await startSync(next.decoded.sub, next.token)
    } else {
      await stopSync()
    }
  }, [])

  // Initialize Google Identity Services and restore any existing session.
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const restored = loadStoredAuth()
    if (restored) {
      void applyAuth(restored)
    }

    if (!GOOGLE_CLIENT_ID) return
    void (async () => {
      try {
        const id = await getGoogleAccountsId()
        id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (resp) => {
            const decoded = decodeJWT(resp.credential)
            if (!decoded || !isTokenValid(decoded)) return
            const stored = storeAuth(resp.credential)
            if (stored) void applyAuth(stored)
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        })
      } catch (err) {
        console.warn('Google Identity Services init failed', err)
      }
    })()
  }, [applyAuth])

  // Mirror sync status into React state.
  useEffect(() => subscribeSyncStatus(setSync), [])

  // Refresh the bearer token used by the sync fetch when auth state updates.
  useEffect(() => {
    if (auth) updateSyncToken(auth.token)
  }, [auth])

  // Stop sync if the token expires while the tab is open.
  useEffect(() => {
    if (!auth) return
    const ms = auth.decoded.exp * 1000 - Date.now()
    if (ms <= 0) {
      void applyAuth(null)
      return
    }
    const t = setTimeout(() => {
      clearAuth()
      void applyAuth(null)
    }, ms)
    return () => clearTimeout(t)
  }, [auth, applyAuth])

  const signIn = useCallback(async () => {
    if (!GOOGLE_CLIENT_ID) {
      alert('VITE_GOOGLE_CLIENT_ID is not set. See README for setup.')
      return
    }
    const id = await getGoogleAccountsId()
    id.prompt()
  }, [])

  const signOut = useCallback(async () => {
    clearAuth()
    try {
      const id = await getGoogleAccountsId()
      id.disableAutoSelect()
    } catch { /* ignore */ }
    await applyAuth(null)
  }, [applyAuth])

  const value = useMemo<AuthContextValue>(() => ({
    auth,
    configured: Boolean(GOOGLE_CLIENT_ID),
    signIn,
    signOut,
    sync,
  }), [auth, signIn, signOut, sync])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
