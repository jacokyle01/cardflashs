import { SignJWT } from 'jose'
import { HttpError, type Env } from './env'

// --- Naming -------------------------------------------------------------------

// Each user's data lives in `userdb-<hex(uid)>`, the same layout couch_peruser
// uses. Firebase uids are ASCII, but encode UTF-8 anyway to be safe.
export function userDbName(uid: string): string {
  const bytes = new TextEncoder().encode(uid)
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return `userdb-${hex}`
}

// Role that grants DB-admin rights on the user's own database. Browser tokens
// carry it (so PouchDB can replicate design docs / mango indexes); agent
// tokens do not, so an agent can read and write documents but cannot touch
// `_security` or design documents.
export function ownerRole(uid: string): string {
  return `owner:${uid}`
}

// --- Admin HTTP client ----------------------------------------------------------

export async function couchAdmin(env: Env, method: string, path: string, body?: unknown): Promise<Response> {
  const base = env.COUCHDB_URL.replace(/\/$/, '')
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: 'Basic ' + btoa(`${env.COUCHDB_ADMIN_USER}:${env.COUCHDB_ADMIN_PASSWORD}`),
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return res
}

async function expectOk(res: Response, what: string, okStatuses: number[] = [200, 201, 202]): Promise<void> {
  if (okStatuses.includes(res.status)) return
  const text = await res.text().catch(() => '')
  console.error(`${what} failed: ${res.status} ${text}`)
  // Surface CouchDB's reason so misconfiguration (wrong admin password,
  // read-only ini) is diagnosable from the UI. Nothing sensitive is in it.
  let reason = ''
  try {
    const body = JSON.parse(text) as { reason?: string; error?: string }
    reason = body.reason ?? body.error ?? ''
  } catch { /* non-JSON body */ }
  const hint =
    res.status === 401 ? ' — check COUCHDB_ADMIN_USER/PASSWORD'
    : reason === 'erofs' ? ' — CouchDB cannot write local.ini (chmod 666 it)'
    : ''
  throw new HttpError(502, `CouchDB: ${what} failed (${res.status}${reason ? ` ${reason}` : ''})${hint}`)
}

// Idempotently create the user's database and pin its `_security`. Called on
// every token exchange; both requests are cheap and safe to repeat.
export async function ensureUserDb(env: Env, uid: string): Promise<string> {
  const db = userDbName(uid)
  const create = await couchAdmin(env, 'PUT', `/${db}`)
  await expectOk(create, `create ${db}`, [201, 202, 412])
  const sec = await couchAdmin(env, 'PUT', `/${db}/_security`, {
    admins: { names: [], roles: [ownerRole(uid)] },
    members: { names: [uid], roles: [] },
  })
  await expectOk(sec, `set _security on ${db}`)
  return db
}

// --- JWT minting ------------------------------------------------------------------

export const APP_KID = 'app'

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.trim())
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function bytesToB64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

export interface CouchJwtOptions {
  uid: string
  kid: string
  secretB64: string
  ttlSeconds: number
  roles?: string[]
  jti?: string
}

// CouchDB maps `sub` -> user name and `_couchdb.roles` -> roles. `kid` selects
// the entry under `[jwt_keys]`; the secret there is base64, and CouchDB signs
// with the decoded bytes, so we decode here to match.
export async function signCouchJwt(opts: CouchJwtOptions): Promise<{ token: string; exp: number }> {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + opts.ttlSeconds
  const jwt = new SignJWT({ ...(opts.roles ? { '_couchdb.roles': opts.roles } : {}) })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT', kid: opts.kid })
    .setSubject(opts.uid)
    .setIssuedAt(now)
    .setExpirationTime(exp)
  if (opts.jti) jwt.setJti(opts.jti)
  const token = await jwt.sign(b64ToBytes(opts.secretB64))
  return { token, exp }
}

// --- Agent keys in CouchDB config ------------------------------------------------------

// Each agent token is signed with its own HMAC key registered under
// `[jwt_keys] hmac:agent-<id>`. Revocation is deleting that key. This uses
// the node-local config endpoint, which is right for a single-node CouchDB.
export function agentKid(id: string): string {
  return `agent-${id}`
}

export async function registerAgentKey(env: Env, id: string, secretB64: string): Promise<void> {
  const res = await couchAdmin(env, 'PUT', `/_node/_local/_config/jwt_keys/hmac:${agentKid(id)}`, secretB64)
  await expectOk(res, `register key ${agentKid(id)}`)
}

export async function deleteAgentKey(env: Env, id: string): Promise<void> {
  const res = await couchAdmin(env, 'DELETE', `/_node/_local/_config/jwt_keys/hmac:${agentKid(id)}`)
  await expectOk(res, `delete key ${agentKid(id)}`, [200, 404])
}

export async function agentKeyExists(env: Env, id: string): Promise<boolean> {
  const res = await couchAdmin(env, 'GET', `/_node/_local/_config/jwt_keys/hmac:${agentKid(id)}`)
  return res.status === 200
}
