import PouchDB from './pouch'
import { getLocalDB } from './db'

type AnyPouch = PouchDB.Database

export type SyncStatus = 'idle' | 'connecting' | 'active' | 'paused' | 'error'

export interface SyncEvent {
  status: SyncStatus
  message?: string
  remoteUrl?: string
}

// .trim() on every env read — Cloudflare Pages' env var UI silently keeps
// trailing whitespace, which gets URL-encoded into the remote URL and breaks
// DNS resolution (`db.cardflashs.com%20/...`).
const COUCHDB_URL: string = ((import.meta.env.VITE_COUCHDB_URL as string | undefined) ?? 'http://localhost:5984').trim()

// Dev-only credentials for talking to CouchDB. We're skipping JWT validation
// for now: CouchDB authenticates the request via Basic auth, and we use
// Google's `sub` claim purely to namespace each user's remote database. Do
// not ship admin credentials baked into a real frontend — see README for the
// path to JWT auth in production.
const COUCHDB_USER: string = ((import.meta.env.VITE_COUCHDB_USERNAME as string | undefined) ?? 'admin').trim()
const COUCHDB_PASS: string = ((import.meta.env.VITE_COUCHDB_PASSWORD as string | undefined) ?? 'admin').trim()

let activeSync: PouchDB.Replication.Sync<Record<string, unknown>> | null = null
let activeRemote: AnyPouch | null = null
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

// We still partition each user's data into `userdb-<hex(sub)>`, matching the
// couch_peruser layout. With JWT off, we just compute the name client-side
// and create the DB on demand using admin credentials.
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

function userDbName(sub: string): string {
  return `userdb-${hexEncode(sub)}`
}

function buildRemote(sub: string): AnyPouch {
  const url = `${COUCHDB_URL.replace(/\/$/, '')}/${userDbName(sub)}`
  return new PouchDB(url, {
    auth: { username: COUCHDB_USER, password: COUCHDB_PASS },
  })
}

export async function startSync(sub: string, _token: string): Promise<void> {
  await stopSync()
  emit({ status: 'connecting' })

  const local = getLocalDB()
  const remote = buildRemote(sub)
  activeRemote = remote

  // Touch the remote to surface auth/reachability problems early.
  // PouchDB will create the DB on first sync if it's missing, so a 404 is fine.
  try {
    await remote.info()
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 401 || status === 403) {
      emit({ status: 'error', message: 'CouchDB rejected credentials' })
      return
    }
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
  emit({ status: 'idle' })
}

// Kept for API compatibility with AuthContext, which calls it whenever the
// stored ID token changes. With JWT validation disabled it's a no-op.
export function updateSyncToken(_token: string): void {}
