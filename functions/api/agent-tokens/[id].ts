// DELETE /api/agent-tokens/:id -> revoke an agent token
//
// Deleting the HMAC key from CouchDB config makes every JWT signed with it
// fail verification immediately, regardless of its `exp`.
import { HttpError } from '../../_lib/env'
import { handle, json } from '../../_lib/http'
import { deleteAgentKey } from '../../_lib/couch'
import { deleteAgentTokenDoc, getAgentTokenDoc } from '../../_lib/agentTokens'

export const onRequestDelete = handle(async ({ env, user, params }) => {
  const id = typeof params.id === 'string' ? params.id : ''
  if (!/^[0-9a-f]{16}$/.test(id)) throw new HttpError(400, 'Invalid token id')

  // Only revoke keys the caller owns: the doc must exist in *their* database.
  const doc = await getAgentTokenDoc(env, user.uid, id)
  if (!doc) throw new HttpError(404, 'No such token')

  await deleteAgentKey(env, id)
  await deleteAgentTokenDoc(env, user.uid, doc)
  return json({ ok: true })
})
