import { useCallback, useEffect, useState } from 'react'
import { Bot, Check, Copy, Loader2, Trash2 } from 'lucide-react'
import { useAuth } from '../lib/useAuth'
import { createAgentToken, listAgentTokens, revokeAgentToken, type AgentTokenInfo, type CreatedAgentToken } from '../lib/agentTokens'
import { remoteDbUrl } from '../lib/sync'

const TTL_OPTIONS: { label: string; days: number }[] = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
  { label: '10 years', days: 3650 },
]

// Settings section for long-lived CouchDB tokens meant for AI agents and
// scripts. Tokens are minted by /api/agent-tokens and shown exactly once.
export default function AgentTokens() {
  const { auth, apiFetch } = useAuth()
  const [tokens, setTokens] = useState<AgentTokenInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [ttlDays, setTtlDays] = useState(365)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<CreatedAgentToken | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!apiFetch) return
    try {
      setTokens(await listAgentTokens(apiFetch))
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [apiFetch])

  useEffect(() => { void reload() }, [reload])

  if (!auth || !apiFetch) {
    return (
      <Section>
        <p className="px-4 pt-3 text-sm text-gray-500">Sign in to create agent tokens.</p>
      </Section>
    )
  }

  const handleCreate = async () => {
    if (!name.trim()) return
    setCreating(true)
    setError(null)
    try {
      const t = await createAgentToken(apiFetch, name.trim(), ttlDays)
      setCreated(t)
      setName('')
      await reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (t: AgentTokenInfo) => {
    if (!confirm(`Revoke "${t.name}"? Anything using it will lose access immediately.`)) return
    setRevoking(t.id)
    setError(null)
    try {
      await revokeAgentToken(apiFetch, t.id)
      if (created?.id === t.id) setCreated(null)
      await reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRevoking(null)
    }
  }

  return (
    <Section>
      <p className="px-4 pt-3 text-xs text-gray-400">
        Long-lived tokens that let an AI agent or script read and write your decks directly through
        CouchDB's HTTP API. A token grants access to your database only. Revoke it here at any time.
      </p>

      {created && <NewToken token={created} onDismiss={() => setCreated(null)} />}

      <div className="px-4 pt-4 flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate() }}
          placeholder="Token name (e.g. claude-code)"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-gray-400"
        />
        <select
          value={ttlDays}
          onChange={(e) => setTtlDays(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-surface outline-none focus:border-gray-400"
        >
          {TTL_OPTIONS.map((o) => <option key={o.days} value={o.days}>Expires in {o.label}</option>)}
        </select>
        <button
          onClick={handleCreate}
          disabled={creating || !name.trim()}
          className="px-4 py-2 bg-accent text-on-accent rounded-lg hover:bg-accent-strong transition-colors cursor-pointer text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
          Create token
        </button>
      </div>

      {error && <p className="px-4 pt-2 text-xs text-red-600">{error}</p>}

      <div className="px-4 pt-4">
        {tokens === null ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-gray-400">No agent tokens yet.</p>
        ) : (
          <ul className="divide-y divide-gray-200 border border-gray-200 rounded-lg">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-800 font-medium truncate">
                    {t.name}
                    {!t.active && <span className="ml-2 text-xs text-red-600 font-normal">revoked</span>}
                  </div>
                  <div className="text-xs text-gray-400">
                    Created {fmt(t.createdAt)} · Expires {fmt(t.expiresAt)}
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(t)}
                  disabled={revoking === t.id}
                  title="Revoke"
                  className="p-1.5 text-gray-400 hover:text-red-600 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {revoking === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 flex flex-col rounded-lg border-2 border-line bg-surface pb-4 w-full">
      <div className="shrink-0 flex items-center p-3 gap-2 border-b border-gray-200">
        <span className="text-lg text-gray-800 font-semibold">Agent access</span>
      </div>
      {children}
    </div>
  )
}

function NewToken({ token, onDismiss }: { token: CreatedAgentToken; onDismiss: () => void }) {
  const dbUrl = remoteDbUrl(token.db)
  const curl = `curl -H "Authorization: Bearer ${token.token}" \\\n  "${dbUrl}/_all_docs?include_docs=true"`
  return (
    <div className="mx-4 mt-3 p-3 rounded-lg border border-amber-200 bg-amber-50 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-amber-900">
          Token "{token.name}" created — copy it now, it won't be shown again.
        </span>
        <button onClick={onDismiss} className="text-xs text-amber-700 hover:text-amber-900 cursor-pointer">Dismiss</button>
      </div>
      <Field label="Token" value={token.token} />
      <Field label="Database URL" value={dbUrl} />
      <Field label="Example" value={curl} />
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable; the text is selectable */ }
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs text-amber-800">{label}</span>
        <button onClick={copy} title="Copy" className="p-1 text-amber-700 hover:text-amber-900 cursor-pointer">
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <pre className="text-xs font-mono bg-surface border border-amber-200 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all select-all">{value}</pre>
    </div>
  )
}

function fmt(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString()
}
