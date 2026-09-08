// Light/dark theming, matching chessrepeat's approach: the choice is stored in
// localStorage and written to <html data-theme>, which index.css reads. A
// pre-paint script in index.html applies it before first paint so there is no
// light flash. "system" removes the attribute and lets the prefers-color-scheme
// media query in index.css decide.

export type Theme = 'light' | 'dark' | 'system'

const KEY = 'cardflashs:theme'

export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    // localStorage can throw in private mode / blocked storage
  }
  return 'system'
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // ignore — the attribute below still applies for this session
  }
  applyTheme(theme)
}

export function resolvedTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}
