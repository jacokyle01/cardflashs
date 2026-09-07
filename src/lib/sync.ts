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
export const COUCHDB_URL: string = ((import.meta.env.VITE_COUCHDB_URL as string | undefined) ?? 'http://localhost:5984')
  .trim()
  .replace(/\/$/, '')

let activeSync: PouchDB.Replication.Sync<Record<string, unknown>> | null = null
let activeRemote: AnyPouch | null = null
let currentStatus: SyncEvent = { status: 'idle' }
const listeners = new Set<(e: SyncEvent) => void>()

// The CouchDB JWT for the current user. Read on every request by the fetch
// wrapper below, so rotating it (updateSyncToken) takes effect immediately
// without restarting replication.
let currentToken: string | null = null

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

export function setSyncError(message: string): void {
  emit({ status: 'error', message })
}

function authFetch(url: string | Request, opts?: RequestInit): Promise<Response> {
  const headers = new Headers(opts?.headers)
  if (currentToken) headers.set('Authorization', `Bearer ${currentToken}`)
  return fetch(url, { ...opts, headers })
}

export function remoteDbUrl(db: string): string {
  return `${COUCHDB_URL}/${db}`
}

function buildRemote(db: string): AnyPouch {
  return new PouchDB(remoteDbUrl(db), {
    fetch: authFetch,
    // The token-exchange function creates the DB and sets its _security; the
    // browser must not try to PUT it.
    skip_setup: true,
  })
}

export async function startSync(db: string, token: string): Promise<void> {
  await stopSync()
  currentToken = token
  emit({ status: 'connecting', remoteUrl: remoteDbUrl(db) })

  const local = getLocalDB()
  const remote = buildRemote(db)
  activeRemote = remote

  // Touch the remote to surface auth/reachability problems early.
  try {
    await remote.info()
  } catch (err) {
    // CouchDB answers 400 (not 401) for a JWT it cannot verify, e.g. one
    // signed with a revoked key.
    const status = (err as { status?: number }).status
    if (status === 400 || status === 401 || status === 403) {
      emit({ status: 'error', message: 'CouchDB rejected the session token' })
      return
    }
    emit({ status: 'error', message: (err as Error).message })
    return
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

// Swap in a fresh CouchDB JWT. Live replication keeps running; the next
// request simply carries the new token.
export function updateSyncToken(token: string): void {
  currentToken = token
}
