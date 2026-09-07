import { HttpError, type Env } from './env'
import { couchAdmin, userDbName } from './couch'

// Metadata for an agent token lives in the user's own database, so it is the
// user's data like everything else. The signing secret is never stored — only
// CouchDB's config holds it, and only as a base64 HMAC key.
export interface AgentTokenDoc {
  _id: string
  _rev?: string
  type: 'agent_token'
  tokenId: string
  name: string
  createdAt: string
  expiresAt: string
}

export const DOC_PREFIX = 'agenttoken:'

export function docId(tokenId: string): string {
  return `${DOC_PREFIX}${tokenId}`
}

export async function listAgentTokenDocs(env: Env, uid: string): Promise<AgentTokenDoc[]> {
  const db = userDbName(uid)
  const q = new URLSearchParams({
    include_docs: 'true',
    startkey: JSON.stringify(DOC_PREFIX),
    endkey: JSON.stringify(`${DOC_PREFIX}￰`),
  })
  const res = await couchAdmin(env, 'GET', `/${db}/_all_docs?${q}`)
  if (res.status === 404) return []
  if (!res.ok) throw new HttpError(502, `CouchDB: list tokens failed (${res.status})`)
  const body = (await res.json()) as { rows: { doc?: AgentTokenDoc }[] }
  return body.rows.map((r) => r.doc).filter((d): d is AgentTokenDoc => !!d && d.type === 'agent_token')
}

export async function getAgentTokenDoc(env: Env, uid: string, tokenId: string): Promise<AgentTokenDoc | null> {
  const res = await couchAdmin(env, 'GET', `/${userDbName(uid)}/${docId(tokenId)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new HttpError(502, `CouchDB: get token failed (${res.status})`)
  return (await res.json()) as AgentTokenDoc
}

export async function putAgentTokenDoc(env: Env, uid: string, doc: AgentTokenDoc): Promise<void> {
  const res = await couchAdmin(env, 'PUT', `/${userDbName(uid)}/${doc._id}`, doc)
  if (!res.ok) throw new HttpError(502, `CouchDB: save token failed (${res.status})`)
}

export async function deleteAgentTokenDoc(env: Env, uid: string, doc: AgentTokenDoc): Promise<void> {
  if (!doc._rev) return
  const res = await couchAdmin(env, 'DELETE', `/${userDbName(uid)}/${doc._id}?rev=${encodeURIComponent(doc._rev)}`)
  if (!res.ok && res.status !== 404) throw new HttpError(502, `CouchDB: delete token failed (${res.status})`)
}
