import { useCallback, useState } from 'react'
import { LogIn, LogOut, Cloud, CloudOff, Loader2 } from 'lucide-react'
import { useAuth } from '../lib/useAuth'
import SignInDialog from './SignInDialog'

export default function AuthButton() {
  const { auth, configured, signOut, sync } = useAuth()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  if (!configured) {
    return (
      <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
        Sign-in disabled — set VITE_FIREBASE_* vars
      </span>
    )
  }

  if (auth) {
    const { user } = auth
    const SyncIcon =
      sync.status === 'active' || sync.status === 'connecting' ? Loader2
      : sync.status === 'error' ? CloudOff
      : Cloud
    const syncTitle =
      sync.status === 'idle' ? 'Sync idle'
      : sync.status === 'connecting' ? 'Connecting…'
      : sync.status === 'active' ? 'Syncing…'
      : sync.status === 'paused' ? 'Synced'
      : `Sync error${sync.message ? `: ${sync.message}` : ''}`

    return (
      <div className="flex items-center gap-2">
        <span title={syncTitle} className={`flex items-center gap-1 text-xs ${sync.status === 'error' ? 'text-red-600' : 'text-gray-500'}`}>
          <SyncIcon className={`w-3.5 h-3.5 ${sync.status === 'active' || sync.status === 'connecting' ? 'animate-spin' : ''}`} />
        </span>
        {user.picture && (
          <img src={user.picture} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
        )}
        <span className="text-sm text-gray-700 hidden sm:inline">
          {user.email ?? user.name ?? user.uid}
        </span>
        <button
          onClick={() => signOut()}
          title="Sign out"
          className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <LogIn className="w-4 h-4" />
        Sign in
      </button>
      {open && <SignInDialog onClose={close} />}
    </>
  )
}
