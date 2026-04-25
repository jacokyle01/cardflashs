import { useEffect, useRef, useState } from 'react'
import { LogIn, LogOut, Cloud, CloudOff, Loader2 } from 'lucide-react'
import { useAuth } from '../lib/useAuth'
import { getGoogleAccountsId } from '../lib/auth'

export default function AuthButton() {
  const { auth, configured, signOut, sync } = useAuth()
  const buttonRef = useRef<HTMLDivElement>(null)
  const [renderError, setRenderError] = useState<string | null>(null)

  useEffect(() => {
    if (auth || !configured || !buttonRef.current) return
    const target = buttonRef.current
    void (async () => {
      try {
        const id = await getGoogleAccountsId()
        id.renderButton(target, {
          type: 'standard',
          theme: 'outline',
          size: 'medium',
          text: 'signin_with',
          shape: 'rectangular',
        })
      } catch (err) {
        setRenderError((err as Error).message)
      }
    })()
  }, [auth, configured])

  if (!configured) {
    return (
      <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
        Sign-in disabled — set VITE_GOOGLE_CLIENT_ID
      </span>
    )
  }

  if (auth) {
    const { decoded } = auth
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
        {decoded.picture && (
          <img src={decoded.picture} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
        )}
        <span className="text-sm text-gray-700 hidden sm:inline">
          {decoded.email ?? decoded.name ?? decoded.sub}
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
    <div className="flex items-center gap-2">
      <div ref={buttonRef} />
      {renderError && (
        <span title={renderError} className="text-xs text-red-600 flex items-center gap-1">
          <LogIn className="w-3 h-3" />
          Sign-in error
        </span>
      )}
    </div>
  )
}
