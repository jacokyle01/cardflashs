import { useEffect, useId, useMemo, useState } from 'react'
import Markdown, { defaultUrlTransform, type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ATT_PREFIX, getImageURL, isAttachmentName, peekImageURL } from '../lib/attachments'
import { loadCardImage } from '../lib/db'

// Renders one side of a card. Card text is Markdown (GFM), so images are
// `![alt](url)`, or `![alt](att:<name>)` for an image stored on the card
// itself (see lib/attachments.ts); a fenced ```mermaid block is drawn as a diagram. Raw HTML is
// not rendered (react-markdown's default), so card content can't inject markup.

interface Props {
  content: string
  // the card whose attachments `att:` images are loaded from
  cardId?: string
  // tighter layout for the deck list: small images, diagrams capped in height
  compact?: boolean
  className?: string
}

// react-markdown strips data: URLs by default; allow inline images so a card
// can carry its picture without a separate host.
function urlTransform(url: string): string {
  if (url.startsWith(ATT_PREFIX) && isAttachmentName(url.slice(ATT_PREFIX.length))) return url
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(url)) return url
  return defaultUrlTransform(url)
}

const components: Components = {
  code({ className, children }) {
    if (/\blanguage-mermaid\b/.test(className ?? '')) {
      return <Mermaid chart={String(children).trim()} />
    }
    return <code className={className}>{children}</code>
  },
  // a mermaid block arrives wrapped in <pre>; drop it so the SVG isn't styled
  // as a code block
  pre({ children, node }) {
    const first = node?.children[0]
    const lang = first && 'properties' in first ? first.properties.className : undefined
    if (Array.isArray(lang) && lang.includes('language-mermaid')) return <>{children}</>
    return <pre>{children}</pre>
  },
  a({ children, href, title }) {
    return <a href={href} title={title} target="_blank" rel="noreferrer">{children}</a>
  },
}

export default function CardContent({ content, cardId, compact, className = '' }: Props) {
  const withImages = useMemo<Components>(() => ({
    ...components,
    img({ src, alt, title }) {
      if (typeof src === 'string' && src.startsWith(ATT_PREFIX)) {
        return <AttachmentImage name={src.slice(ATT_PREFIX.length)} cardId={cardId} alt={alt} title={title} />
      }
      return <img src={src} alt={alt} title={title} />
    },
  }), [cardId])

  return (
    <div className={`card-md ${compact ? 'card-md-compact' : ''} ${className}`}>
      <Markdown remarkPlugins={[remarkGfm]} components={withImages} urlTransform={urlTransform}>
        {content}
      </Markdown>
    </div>
  )
}

// --- card images ---

export function AttachmentImage({ name, cardId, alt, title }: {
  name: string
  cardId?: string
  alt?: string
  title?: string
}) {
  const [loaded, setLoaded] = useState<{ name: string; url: string | null } | null>(null)
  const peeked = peekImageURL(name)

  useEffect(() => {
    if (peeked) return
    let cancelled = false
    void getImageURL(name, cardId ? () => loadCardImage(cardId, name) : undefined)
      .then(url => { if (!cancelled) setLoaded({ name, url }) })
    return () => { cancelled = true }
  }, [name, cardId, peeked])

  // undefined while loading, null when the image can't be found
  const url = peeked ?? (loaded?.name === name ? loaded.url : undefined)
  if (url === undefined) return <span className="card-img-placeholder" />
  if (url === null) return <span className="text-xs text-gray-400">[missing image]</span>
  return <img src={url} alt={alt} title={title} />
}

// --- mermaid ---

function isDark(): boolean {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr) return attr === 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

// follow the app theme toggle (data-theme) and the OS preference
function useDark(): boolean {
  const [dark, setDark] = useState(isDark)
  useEffect(() => {
    const update = () => setDark(isDark())
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', update)
    return () => {
      observer.disconnect()
      mq.removeEventListener('change', update)
    }
  }, [])
  return dark
}

// mermaid is large; load it only when a card actually contains a diagram
let mermaidPromise: Promise<typeof import('mermaid').default> | null = null
function loadMermaid() {
  mermaidPromise ??= import('mermaid').then(m => m.default)
  return mermaidPromise
}

// mermaid.initialize is global, so renders are serialized to keep one card's
// theme from leaking into another's
let renderQueue: Promise<unknown> = Promise.resolve()

function Mermaid({ chart }: { chart: string }) {
  const id = `mmd-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`
  const dark = useDark()
  const [result, setResult] = useState<{ svg?: string; error?: string }>({})

  useEffect(() => {
    let cancelled = false
    const job = renderQueue.then(async () => {
      const mermaid = await loadMermaid()
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default' })
      try {
        const { svg } = await mermaid.render(id, chart)
        if (!cancelled) setResult({ svg })
      } catch (e) {
        // mermaid leaves its error graphic in the body on a failed render
        document.getElementById(`d${id}`)?.remove()
        if (!cancelled) setResult({ error: e instanceof Error ? e.message : String(e) })
      }
    })
    renderQueue = job.catch(() => {})
    return () => {
      cancelled = true
    }
  }, [id, chart, dark])

  if (result.error) {
    return (
      <pre className="text-left text-xs text-red-600 whitespace-pre-wrap">
        Mermaid error: {result.error}
        {'\n\n'}
        {chart}
      </pre>
    )
  }
  if (!result.svg) return <div className="text-sm text-gray-400">Rendering diagram…</div>
  // securityLevel 'strict' sanitizes the SVG mermaid produces
  return <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: result.svg }} />
}
