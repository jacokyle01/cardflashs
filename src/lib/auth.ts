// Google Identity Services + JWT helpers.
// We never verify the JWT signature client-side — verification happens at CouchDB,
// which is configured with Google's RS256 public keys. We just decode it for UI/sync.

const GIS_SCRIPT = 'https://accounts.google.com/gsi/client'
const TOKEN_KEY = 'cardflashs.idtoken'

export interface DecodedToken {
  sub: string
  email?: string
  name?: string
  picture?: string
  exp: number
  iss: string
  aud: string
}

export interface AuthState {
  token: string
  decoded: DecodedToken
}

function b64urlDecode(input: string): string {
  const pad = '='.repeat((4 - (input.length % 4)) % 4)
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  let out = ''
  for (let i = 0; i < bin.length; i++) {
    out += '%' + bin.charCodeAt(i).toString(16).padStart(2, '0')
  }
  return decodeURIComponent(out)
}

export function decodeJWT(token: string): DecodedToken | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    return JSON.parse(b64urlDecode(parts[1])) as DecodedToken
  } catch {
    return null
  }
}

export function isTokenValid(decoded: DecodedToken): boolean {
  return Date.now() < decoded.exp * 1000
}

export function loadStoredAuth(): AuthState | null {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return null
  const decoded = decodeJWT(token)
  if (!decoded || !isTokenValid(decoded)) {
    localStorage.removeItem(TOKEN_KEY)
    return null
  }
  return { token, decoded }
}

export function storeAuth(token: string): AuthState | null {
  const decoded = decodeJWT(token)
  if (!decoded || !isTokenValid(decoded)) return null
  localStorage.setItem(TOKEN_KEY, token)
  return { token, decoded }
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
}

let gisLoadPromise: Promise<void> | null = null

export function loadGoogleIdentityServices(): Promise<void> {
  if (gisLoadPromise) return gisLoadPromise
  gisLoadPromise = new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${GIS_SCRIPT}"]`)) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = GIS_SCRIPT
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.appendChild(s)
  })
  return gisLoadPromise
}

interface GoogleCredentialResponse {
  credential: string
}

interface GoogleAccountsId {
  initialize: (config: {
    client_id: string
    callback: (resp: GoogleCredentialResponse) => void
    auto_select?: boolean
    cancel_on_tap_outside?: boolean
  }) => void
  prompt: () => void
  renderButton: (parent: HTMLElement, opts: Record<string, unknown>) => void
  disableAutoSelect: () => void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } }
  }
}

export async function getGoogleAccountsId(): Promise<GoogleAccountsId> {
  await loadGoogleIdentityServices()
  if (!window.google?.accounts?.id) {
    throw new Error('Google Identity Services not available')
  }
  return window.google.accounts.id
}
