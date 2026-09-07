// GET  /api/agent-tokens   -> list the caller's agent tokens (metadata only)
// POST /api/agent-tokens   -> { name, ttlDays? } -> mint a long-lived token
//
// The minted token is returned exactly once. It is a CouchDB JWT with the
// user's uid as `sub`, signed by a per-token HMAC key registered in CouchDB's
// config, so revoking it is just deleting that key.
import { HttpError } from '../../_lib/env'
import { handle, json, readJson } from '../../_lib/http'
import {
  agentKeyExists,
  agentKid,
  bytesToB64,
  ensureUserDb,
  registerAgentKey,
  signCouchJwt,
  userDbName,
} from '../../_lib/couch'
import { docId, listAgentTokenDocs, putAgentTokenDoc, type AgentTokenDoc } from '../../_lib/agentTokens'

const DEFAULT_TTL_DAYS = 365
const MAX_TTL_DAYS = 3650

export const onRequestGet = handle(async ({ env, user }) => {
  const docs = await listAgentTokenDocs(env, user.uid)
  // A doc whose key is gone from CouchDB config is already revoked (e.g. the
  // config was wiped) — report it as such rather than listing a dead token.
  const tokens = await Promise.all(
    docs.map(async (d) => ({
      id: d.tokenId,
      name: d.name,
      createdAt: d.createdAt,
      expiresAt: d.expiresAt,
      active: await agentKeyExists(env, d.tokenId),
    })),
  )
  return json({ tokens })
})

export const onRequestPost = handle(async ({ request, env, user }) => {
  const body = await readJson<{ name?: unknown; ttlDays?: unknown }>(request)
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : ''
  if (!name) throw new HttpError(400, 'name is required')
  const ttlDays =
    typeof body.ttlDays === 'number' && Number.isFinite(body.ttlDays)
      ? Math.min(MAX_TTL_DAYS, Math.max(1, Math.floor(body.ttlDays)))
      : DEFAULT_TTL_DAYS

  await ensureUserDb(env, user.uid)

  const id = bytesToHex(crypto.getRandomValues(new Uint8Array(8)))
  const secretB64 = bytesToB64(crypto.getRandomValues(new Uint8Array(32)))

  // Register the key before minting so the token is valid the moment it is
  // handed out.
  await registerAgentKey(env, id, secretB64)
  const { token, exp } = await signCouchJwt({
    uid: user.uid,
    kid: agentKid(id),
    secretB64,
    ttlSeconds: ttlDays * 24 * 60 * 60,
    jti: id,
  })

  const doc: AgentTokenDoc = {
    _id: docId(id),
    type: 'agent_token',
    tokenId: id,
    name,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(exp * 1000).toISOString(),
  }
  await putAgentTokenDoc(env, user.uid, doc)

  return json(
    {
      id,
      name,
      token,
      expiresAt: doc.expiresAt,
      db: userDbName(user.uid),
    },
    201,
  )
})

function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return hex
}
