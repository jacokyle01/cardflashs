import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import {
  type ApiFetch,
  type AuthState,
  type CouchSession,
  clearSession,
  exchangeToken,
  isSessionValid,
  loadCachedSession,
  makeApiFetch,
  storeSession,
  toAuthUser,
} from './auth'
import { getFirebaseAuth, isFirebaseConfigured } from './firebase'
import { AuthContext, type AuthContextValue } from './authContextValue'
import { setSyncError, startSync, stopSync, subscribeSyncStatus, type SyncEvent, updateSyncToken } from './sync'

// Refresh the CouchDB token this long before it expires.
const REFRESH_MARGIN_MS = 5 * 60 * 1000
// If a refresh fails (function unreachable), try again after this long.
const REFRESH_RETRY_MS = 60 * 1000

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isFirebaseConfigured()
  const [auth, setAuth] = useState<AuthState | null>(null)
  const [sync, setSync] = useState<SyncEvent>({ status: 'idle' })
  const [apiFetch, setApiFetch] = useState<ApiFetch | null>(null)
  const currentUidRef = useRef<string | null>(null)

  // Exchange the Firebase ID token for a CouchDB session and (re)start sync.
  // Falls back to a cached, still-valid session if the function is unreachable
  // so an offline reload can still sync against a reachable CouchDB.
  const establish = useCallback(async (user: User, fetcher: ApiFetch) => {
    let session: CouchSession | null = null
    let error: string | null = null
    try {
      session = await exchangeToken(fetcher)
      storeSession(user.uid, session)
    } catch (err) {
      error = (err as Error).message
      session = loadCachedSession(user.uid)
    }
    if (currentUidRef.current !== user.uid) return // signed out meanwhile
    setAuth({ user: toAuthUser(user), couch: session })
    if (session) {
      await startSync(session.db, session.token)
    } else {
      await stopSync()
      setSyncError(error ?? 'Token exchange failed')
    }
  }, [])

  // Firebase drives sign-in/sign-out state. onIdTokenChanged also fires on
  // Firebase's own hourly refresh; we ignore those and refresh the CouchDB
  // token on our own schedule below.
  useEffect(() => {
    if (!configured) return
    const unsub = onIdTokenChanged(getFirebaseAuth(), (user) => {
      void (async () => {
        if (!user) {
          currentUidRef.current = null
          clearSession()
          setApiFetch(null)
          setAuth(null)
          await stopSync()
          return
        }
        if (currentUidRef.current === user.uid) return
        currentUidRef.current = user.uid
        const fetcher = makeApiFetch(user)
        setApiFetch(() => fetcher)
        await establish(user, fetcher)
      })()
    })
    return unsub
  }, [configured, establish])

  // Mirror sync status into React state.
  useEffect(() => subscribeSyncStatus(setSync), [])

  // Keep the CouchDB token fresh while signed in.
  useEffect(() => {
    if (!auth || !apiFetch) return
    const uid = auth.user.uid
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    const refresh = async () => {
      try {
        const session = await exchangeToken(apiFetch)
        if (cancelled || currentUidRef.current !== uid) return
        storeSession(uid, session)
        updateSyncToken(session.token)
        setAuth((prev) => (prev && prev.user.uid === uid ? { ...prev, couch: session } : prev))
        // If we previously had no session at all, sync never started.
        if (!auth.couch) await startSync(session.db, session.token)
      } catch {
        if (cancelled) return
        timer = setTimeout(refresh, REFRESH_RETRY_MS)
      }
    }

    const delay = auth.couch && isSessionValid(auth.couch)
      ? Math.max(1000, auth.couch.exp * 1000 - Date.now() - REFRESH_MARGIN_MS)
      : REFRESH_RETRY_MS
    timer = setTimeout(refresh, delay)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [auth, apiFetch])

  // Sign-in methods. Firebase's default "one account per email" setting
  // means a Google sign-in and a password sign-in with the same address
  // resolve to the same uid, and therefore the same CouchDB database.
  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    await signInWithPopup(getFirebaseAuth(), provider)
  }, [])

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(getFirebaseAuth(), email, password)
  }, [])

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    await createUserWithEmailAndPassword(getFirebaseAuth(), email, password)
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(getFirebaseAuth(), email)
  }, [])

  const signOut = useCallback(async () => {
    if (!configured) return
    await firebaseSignOut(getFirebaseAuth())
  }, [configured])

  const value = useMemo<AuthContextValue>(() => ({
    auth,
    configured,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    signOut,
    sync,
    apiFetch,
  }), [auth, configured, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, signOut, sync, apiFetch])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
