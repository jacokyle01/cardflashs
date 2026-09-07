import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { useAuth } from '../lib/useAuth'

type Mode = 'signin' | 'signup' | 'reset'

// Maps Firebase auth error codes to something a person can act on.
function describe(err: unknown): string {
  const code = (err as { code?: string }).code ?? ''
  switch (code) {
    case 'auth/invalid-email': return 'That email address is not valid.'
    case 'auth/missing-password': return 'Enter your password.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Wrong email or password.'
    case 'auth/weak-password': return 'Password must be at least 6 characters.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in with your password, or with Google if you used that before.'
    case 'auth/too-many-requests': return 'Too many attempts. Try again in a few minutes.'
    case 'auth/popup-blocked': return 'Your browser blocked the sign-in popup. Allow popups for this site and try again.'
    case 'auth/unauthorized-domain': return 'This domain is not authorized for sign-in. See SETUP.md.'
    case 'auth/network-request-failed': return 'Network error. Check your connection and try again.'
    default: return (err as Error).message || 'Sign-in failed.'
  }
}

const CANCELLED = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request'])

export default function SignInDialog({ onClose }: { onClose: () => void }) {
  const { auth, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Close once sign-in has taken effect.
  useEffect(() => {
    if (auth) onClose()
  }, [auth, onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await fn()
    } catch (err) {
      if (!CANCELLED.has((err as { code?: string }).code ?? '')) setError(describe(err))
    } finally {
      setBusy(false)
    }
  }

  const submit = () => {
    const addr = email.trim()
    if (!addr) { setError('Enter your email address.'); return }
    if (mode === 'reset') {
      void run(async () => {
        await resetPassword(addr)
        setNotice(`If an account exists for ${addr}, a reset link is on its way.`)
        setMode('signin')
      })
      return
    }
    if (!password) { setError('Enter your password.'); return }
    void run(() => (mode === 'signup' ? signUpWithEmail(addr, password) : signInWithEmail(addr, password)))
  }

  const title = mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Reset password' : 'Sign in'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-lg border border-gray-300 p-6 w-full max-w-sm mx-4" role="dialog" aria-modal="true" aria-labelledby="signin-title">
        <div className="flex items-center justify-between mb-4">
          <h2 id="signin-title" className="text-lg text-gray-800 font-semibold">{title}</h2>
          <button onClick={onClose} title="Close" className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {mode !== 'reset' && (
          <>
            <button
              onClick={() => void run(signInWithGoogle)}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-60"
            >
              <GoogleMark />
              Continue with Google
            </button>
            <div className="flex items-center gap-3 my-4 text-xs text-gray-400">
              <div className="flex-1 h-px bg-gray-200" />
              or
              <div className="flex-1 h-px bg-gray-200" />
            </div>
          </>
        )}

        <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex flex-col gap-3">
          <input
            autoFocus
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-gray-400"
          />
          {mode !== 'reset' && (
            <input
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder={mode === 'signup' ? 'Password (6+ characters)' : 'Password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-gray-400"
            />
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
          {notice && <p className="text-xs text-green-700">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors cursor-pointer text-sm font-medium disabled:opacity-60"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
          </button>
        </form>

        <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
          {mode === 'signin' && (
            <>
              <button onClick={() => { setMode('signup'); setError(null) }} className="hover:text-gray-800 cursor-pointer">Create an account</button>
              <button onClick={() => { setMode('reset'); setError(null) }} className="hover:text-gray-800 cursor-pointer">Forgot password?</button>
            </>
          )}
          {mode !== 'signin' && (
            <button onClick={() => { setMode('signin'); setError(null) }} className="hover:text-gray-800 cursor-pointer">Back to sign in</button>
          )}
        </div>
      </div>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.2v3.1C3.2 21.3 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3c-.5-1.5-.5-3.1 0-4.6V6.6H1.2c-1.6 3.3-1.6 7.5 0 10.8l4.1-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.3 0 3.2 2.7 1.2 6.6l4.1 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  )
}
