// Client for the agent-token endpoints in functions/api/agent-tokens/.
import { apiError, type ApiFetch } from './auth'

export interface AgentTokenInfo {
  id: string
  name: string
  createdAt: string
  expiresAt: string
  // False if the signing key is gone from CouchDB (revoked out-of-band).
  active: boolean
}

export interface CreatedAgentToken {
  id: string
  name: string
  // Shown once; never retrievable again.
  token: string
  expiresAt: string
  db: string
}

export async function listAgentTokens(apiFetch: ApiFetch): Promise<AgentTokenInfo[]> {
  const res = await apiFetch('/api/agent-tokens')
  if (!res.ok) throw await apiError(res, 'Could not list agent tokens')
  return ((await res.json()) as { tokens: AgentTokenInfo[] }).tokens
}

export async function createAgentToken(apiFetch: ApiFetch, name: string, ttlDays: number): Promise<CreatedAgentToken> {
  const res = await apiFetch('/api/agent-tokens', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, ttlDays }),
  })
  if (!res.ok) throw await apiError(res, 'Could not create agent token')
  return (await res.json()) as CreatedAgentToken
}

export async function revokeAgentToken(apiFetch: ApiFetch, id: string): Promise<void> {
  const res = await apiFetch(`/api/agent-tokens/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) throw await apiError(res, 'Could not revoke agent token')
}
