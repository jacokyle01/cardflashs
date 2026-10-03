// Card images are stored as PouchDB attachments on the card doc and referenced
// from the Markdown as `![alt](att:<name>)`. The name is a hash of the image
// bytes, so a given name always means the same picture: the blob/URL caches
// below never go stale, and pasting the same image twice stores it once.
//
// This module has no DB access of its own. Callers that can fetch an
// attachment pass a loader; images just pasted into an editor are remembered
// here until the card is saved, which is where db.ts picks them up.

export const ATT_PREFIX = 'att:'

const NAME_RE = /^[a-z0-9]+\.(webp|png|jpe?g|gif|svg)$/
const REF_RE = /\]\(att:([a-z0-9]+\.[a-z]+)/g

const MAX_DIM = 1600
const QUALITY = 0.85

export function isAttachmentName(name: string): boolean {
  return NAME_RE.test(name)
}

// Names of every attachment the given card text points at.
export function referencedImages(texts: string[]): Set<string> {
  const names = new Set<string>()
  for (const t of texts) for (const m of t.matchAll(REF_RE)) names.add(m[1])
  return names
}

// Drops every Markdown image reference to `name`, plus the blank line it was on.
export function removeImageRef(text: string, name: string): string {
  const esc = name.replace(/\./g, '\\.')
  return text
    .replace(new RegExp(`^[ \\t]*!\\[[^\\]]*\\]\\(att:${esc}\\)[ \\t]*\\n?`, 'gm'), '')
    .replace(new RegExp(`!\\[[^\\]]*\\]\\(att:${esc}\\)`, 'g'), '')
}

// --- blob / URL cache ---

const blobs = new Map<string, Promise<Blob | null>>()
const urls = new Map<string, string>()

export function rememberImage(name: string, blob: Blob): void {
  blobs.set(name, Promise.resolve(blob))
}

// The blob for `name`, loading it once via `load` if it isn't cached. A failed
// load isn't cached, so the image can show up later (e.g. after a sync).
export function getImageBlob(name: string, load?: () => Promise<Blob>): Promise<Blob | null> {
  const cached = blobs.get(name)
  if (cached) return cached
  if (!load) return Promise.resolve(null)
  const p = load().catch(() => null)
  blobs.set(name, p)
  void p.then(b => { if (!b) blobs.delete(name) })
  return p
}

export function peekImageURL(name: string): string | undefined {
  return urls.get(name)
}

export async function getImageURL(name: string, load?: () => Promise<Blob>): Promise<string | null> {
  const blob = await getImageBlob(name, load)
  if (!blob) return null
  let url = urls.get(name)
  if (!url) {
    url = URL.createObjectURL(blob)
    urls.set(name, url)
  }
  return url
}

// --- preparing a picked/pasted file ---

const EXT: Record<string, string> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

async function hashName(blob: Blob, ext: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  const hex = Array.from(new Uint8Array(digest).slice(0, 12), b => b.toString(16).padStart(2, '0')).join('')
  return `${hex}.${ext}`
}

// Scales photos down to MAX_DIM and re-encodes them as WebP so a phone picture
// doesn't put megabytes into every sync. GIFs keep their animation and SVGs
// stay vector. If re-encoding a small image only makes it bigger, the original
// is kept.
async function shrink(file: Blob): Promise<Blob> {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const out = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/webp', QUALITY))
  if (!out) return file
  if (scale === 1 && out.size >= file.size && EXT[file.type]) return file
  return out
}

// Turns a pasted/dropped/picked file into a named image ready to reference.
// Throws if the file isn't an image the browser can decode.
export async function addImage(file: Blob): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Not an image')
  const blob = await shrink(file)
  const ext = EXT[blob.type]
  if (!ext) throw new Error(`Unsupported image type: ${blob.type}`)
  const name = await hashName(blob, ext)
  rememberImage(name, blob)
  return name
}
