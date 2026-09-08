import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { getStoredTheme, resolvedTheme, setTheme, type Theme } from '../lib/theme'

// A single button that flips between light and dark. It starts from the stored
// preference (which may be "system") and, once clicked, pins an explicit theme.
export default function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme())
  const resolved = resolvedTheme(theme)

  // While following the system, re-render if the OS setting changes so the icon
  // stays truthful.
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setThemeState('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const toggle = () => {
    const next: Theme = resolved === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }

  return (
    <button
      onClick={toggle}
      title={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`}
      className="p-2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
    >
      {resolved === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  )
}
