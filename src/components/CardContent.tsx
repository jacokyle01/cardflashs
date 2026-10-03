import { useEffect, useId, useState } from 'react'
import Markdown, { defaultUrlTransform, type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Renders one side of a card. Card text is Markdown (GFM), so images are
// `![alt](url)`; a fenced ```mermaid block is drawn as a diagram. Raw HTML is
// not rendered (react-markdown's default), so card content can't inject markup.

interface Props {
  content: string
  // tighter layout for the deck list: small images, diagrams capped in height
  compact?: boolean
  className?: string
}

// react-markdown strips data: URLs by default; allow inline images so a card
// can carry its picture without a separate host.
function urlTransform(url: string): string {
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

export default function CardContent({ content, compact, className = '' }: Props) {
  return (
    <div className={`card-md ${compact ? 'card-md-compact' : ''} ${className}`}>
      <Markdown remarkPlugins={[remarkGfm]} components={components} urlTransform={urlTransform}>
        {content}
      </Markdown>
    </div>
  )
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
