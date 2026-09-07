// Auth state shared across the app, plus the client side of the token
// exchange. Identity comes from Firebase; the CouchDB session is a
// short-lived JWT minted by /api/token, which we cache so a reload can
// resume sync before (or without) reaching the function.

import type { User } from 'firebase/auth'

export interface AuthUser {
  uid: string
  email?: string
  name?: string
  picture?: string
}

export interface CouchSession {
  token: string
  // Unix seconds.
  exp: number
  // Remote database name, e.g. `userdb-<hex(uid)>`. Computed server-side.
  db: string
}

export interface AuthState {
  user: AuthUser
  // Null when signed in to Firebase but the token exchange hasn't succeeded.
  couch: CouchSession | null
}

export function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email ?? undefined,
    name: user.displayName ?? undefined,
    picture: user.photoURL ?? undefined,
  }
}

// --- Token-exchange API client -------------------------------------------------

const API_URL: string = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').trim().replace(/\/$/, '')

export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>

// Attaches the Firebase ID token. Firebase refreshes it transparently.
export function makeApiFetch(user: User): ApiFetch {
  return async (path, init = {}) => {
    const idToken = await user.getIdToken()
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${idToken}`)
    return fetch(`${API_URL}${path}`, { ...init, headers })
  }
}

export async function apiError(res: Response, fallback: string): Promise<Error> {
  try {
    const body = (await res.json()) as { error?: string }
    return new Error(body.error ?? fallback)
  } catch {
    return new Error(`${fallback} (${res.status})`)
  }
}

export async function exchangeToken(apiFetch: ApiFetch): Promise<CouchSession> {
  const res = await apiFetch('/api/token', { method: 'POST' })
  if (!res.ok) throw await apiError(res, 'Token exchange failed')
  const body = (await res.json()) as CouchSession
  return { token: body.token, exp: body.exp, db: body.db }
}

// --- Session cache -------------------------------------------------------------------

const SESSION_KEY = 'cardflashs.couchsession'

interface StoredSession extends CouchSession {
  uid: string
}

export function isSessionValid(s: CouchSession, marginSeconds = 60): boolean {
  return Date.now() / 1000 < s.exp - marginSeconds
}

export function loadCachedSession(uid: string): CouchSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as StoredSession
    if (s.uid !== uid || !isSessionValid(s)) return null
    return { token: s.token, exp: s.exp, db: s.db }
  } catch {
    return null
  }
}

export function storeSession(uid: string, s: CouchSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ uid, ...s } satisfies StoredSession))
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}
