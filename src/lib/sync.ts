import PouchDB from './pouch'
import { getLocalDB } from './db'

type AnyPouch = PouchDB.Database

export type SyncStatus = 'idle' | 'connecting' | 'active' | 'paused' | 'error'

export interface SyncEvent {
  status: SyncStatus
  message?: string
  remoteUrl?: string
}

const COUCHDB_URL: string = (import.meta.env.VITE_COUCHDB_URL as string | undefined) ?? 'http://localhost:5984'

let activeSync: PouchDB.Replication.Sync<Record<string, unknown>> | null = null
let activeRemote: AnyPouch | null = null
let currentToken: string | null = null
let currentStatus: SyncEvent = { status: 'idle' }
const listeners = new Set<(e: SyncEvent) => void>()

function emit(e: SyncEvent) {
  currentStatus = e
  for (const l of listeners) l(e)
}

export function getSyncStatus(): SyncEvent {
  return currentStatus
}

export function subscribeSyncStatus(cb: (e: SyncEvent) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

// CouchDB user names from JWT default to the `sub` claim. couch_peruser then
// stores user data in `userdb-<hex(name)>`. We compute that here so PouchDB
// targets the correct remote DB without requiring a server-side mapping.
function hexEncode(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    if (code > 0xff) {
      const bytes = new TextEncoder().encode(s.charAt(i))
      for (const b of bytes) out += b.toString(16).padStart(2, '0')
    } else {
      out += code.toString(16).padStart(2, '0')
    }
  }
  return out
}

function buildRemote(sub: string, getToken: () => string | null): AnyPouch {
  const dbName = `userdb-${hexEncode(sub)}`
  const url = `${COUCHDB_URL.replace(/\/$/, '')}/${dbName}`
  return new PouchDB(url, {
    skip_setup: true,
    fetch: (urlIn, opts) => {
      const token = getToken()
      const headers = new Headers(opts?.headers as HeadersInit | undefined)
      if (token) headers.set('Authorization', `Bearer ${token}`)
      return PouchDB.fetch(urlIn, { ...opts, headers })
    },
  })
}

export async function startSync(sub: string, token: string): Promise<void> {
  await stopSync()
  currentToken = token
  emit({ status: 'connecting' })

  const local = getLocalDB()
  const remote = buildRemote(sub, () => currentToken)
  activeRemote = remote

  // Probe the remote so couch_peruser materializes the userdb on first contact.
  // 401 means our token is bad; bubble up to UI.
  try {
    await remote.info()
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 401 || status === 403) {
      emit({ status: 'error', message: 'Authentication rejected by CouchDB' })
      return
    }
    // 404 here is normal pre-couch_peruser materialization; sync will trigger creation.
    if (status !== 404) {
      emit({ status: 'error', message: (err as Error).message })
      return
    }
  }

  activeSync = local
    .sync(remote, { live: true, retry: true })
    .on('change', () => emit({ status: 'active' }))
    .on('paused', () => emit({ status: 'paused' }))
    .on('active', () => emit({ status: 'active' }))
    .on('error', (err: unknown) => emit({ status: 'error', message: String(err) }))
}

export async function stopSync(): Promise<void> {
  if (activeSync) {
    activeSync.cancel()
    activeSync = null
  }
  if (activeRemote) {
    try { await activeRemote.close() } catch { /* ignore */ }
    activeRemote = null
  }
  currentToken = null
  emit({ status: 'idle' })
}

export function updateSyncToken(token: string): void {
  currentToken = token
}
