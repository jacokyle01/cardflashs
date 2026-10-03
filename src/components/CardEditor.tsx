import { useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { addImage, referencedImages, removeImageRef } from '../lib/attachments'
import { AttachmentImage } from './CardContent'

// The `---`-separated card textarea, plus images: paste, drop or pick a file
// and it's shrunk, held in memory, and referenced at the cursor as
// `![image](att:<name>)`. The image is written to the card as an attachment
// when the card is saved (createCard / editCard), so cancelling leaves nothing
// behind.

interface Props {
  value: string
  onChange: (value: string) => void
  // the card being edited, so images it already stores can be previewed
  cardId?: string
  className?: string
  rows?: number
  autoFocus?: boolean
  placeholder?: string
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>
}

function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter(f => f.type.startsWith('image/'))
}

export default function CardEditor({ value, onChange, cardId, className = '', ...textareaProps }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // latest value, for inserting after the async image work finishes
  const valueRef = useRef(value)
  valueRef.current = value
  const [busy, setBusy] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const insertImages = async (files: File[]) => {
    if (!files.length) return
    const el = textareaRef.current
    const start = el?.selectionStart ?? valueRef.current.length
    const end = el?.selectionEnd ?? start
    setError(null)
    setBusy(n => n + 1)
    try {
      const names: string[] = []
      for (const f of files) {
        try {
          names.push(await addImage(f))
        } catch {
          setError(`Couldn't read ${f.name || 'that image'}.`)
        }
      }
      if (!names.length) return
      const text = names.map(n => `![image](att:${n})`).join('\n')
      const cur = valueRef.current
      const at = Math.min(start, cur.length)
      const to = Math.min(Math.max(end, at), cur.length)
      const next = cur.slice(0, at) + text + cur.slice(to)
      onChange(next)
      requestAnimationFrame(() => {
        el?.focus()
        el?.setSelectionRange(at + text.length, at + text.length)
      })
    } finally {
      setBusy(n => n - 1)
    }
  }

  const images = [...referencedImages([value])]

  return (
    <div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onPaste={e => {
          const files = imageFiles(e.clipboardData.files)
          if (!files.length) return
          e.preventDefault()
          void insertImages(files)
        }}
        onDragOver={e => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          setDragging(false)
          const files = imageFiles(e.dataTransfer.files)
          if (!files.length) return
          e.preventDefault()
          void insertImages(files)
        }}
        className={`${className} ${dragging ? 'border-accent! bg-recessed' : ''}`}
        {...textareaProps}
      />
      <div className="flex flex-wrap items-center gap-2 mt-1">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          title="Add an image (or paste / drop one into the text)"
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          <ImagePlus className="w-3.5 h-3.5" />
          {busy > 0 ? 'Adding image…' : 'Image'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => {
            const files = imageFiles(e.target.files)
            e.target.value = ''
            void insertImages(files)
          }}
        />
        {error && <span className="text-xs text-red-600">{error}</span>}
        {images.map(name => (
          <div key={name} className="card-md card-thumb relative group">
            <AttachmentImage name={name} cardId={cardId} alt="" />
            <button
              type="button"
              onClick={() => onChange(removeImageRef(valueRef.current, name))}
              title="Remove this image"
              className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-gray-700 text-white cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
