// Browser-side file download helpers, kept out of db.ts so the data layer
// stays free of DOM concerns.

// Filenames only; anything that isn't a-z0-9 collapses to a dash so a deck
// called "Spanish — Verbs (set 2)" still downloads cleanly.
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function downloadJSON(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}
