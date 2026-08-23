import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Clock, CreditCard, Pencil, Check, X, BarChart3, Upload, Download, FileUp } from 'lucide-react'
import { State } from 'ts-fsrs'

function formatDueIn(due: Date | string): string {
  const now = Date.now()
  const dueMs = new Date(due).getTime()
  if (dueMs <= now) return 'Now'
  const diffMs = dueMs - now
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 60) return `in ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `in ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `in ${days}d`
  if (days < 30) return `in ${Math.floor(days / 7)}w`
  const months = Math.floor(days / 30)
  if (months < 12) return `in ${months}mo`
  const years = Math.floor(months / 12)
  return `in ${years}y`
}
import {
  getDeck, getCardsForDeck, createCard, deleteCard, updateCard, getLocalDB,
  exportDeck, parseDeckExport, importCards,
  type DeckExport, type ImportResult,
} from '../lib/db'
import { parseCardContent } from '../lib/db'
import type { Deck, FlashCard } from '../lib/types'
import { useAuth } from '../lib/useAuth'
import { downloadJSON, slugify, todayStamp } from '../lib/download'

export default function DeckView() {
  const { deckId } = useParams<{ deckId: string }>()
  const [deck, setDeck] = useState<Deck | null>(null)
  const [cards, setCards] = useState<FlashCard[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [rawContent, setRawContent] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [statsId, setStatsId] = useState<string | null>(null)
  const [showBulk, setShowBulk] = useState(false)
  const [bulkContent, setBulkContent] = useState('')
  const [bulkSeparator, setBulkSeparator] = useState(',')
  const [bulkImporting, setBulkImporting] = useState(false)
  const [importPreview, setImportPreview] = useState<DeckExport | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { auth } = useAuth()
  const userKey = auth?.decoded.sub ?? 'anon'

  const load = async () => {
    if (!deckId) return
    const [d, c] = await Promise.all([getDeck(deckId), getCardsForDeck(deckId)])
    setDeck(d)
    setCards(c)
  }

  useEffect(() => {
    load()
    const changes = getLocalDB().changes({ since: 'now', live: true })
      .on('change', () => load())
    return () => changes.cancel()
  }, [deckId, userKey])

  const handleCreate = async () => {
    if (!rawContent.trim() || !deckId) return
    await createCard(deckId, rawContent)
    setRawContent('')
    setShowCreate(false)
    load()
  }

  const handleDelete = async (id: string) => {
    await deleteCard(id)
    load()
  }

  const handleEditStart = (card: FlashCard) => {
    const parts = [card.front.content, ...card.backs.map(b => b.content)]
    setEditContent(parts.join('\n---\n'))
    setEditingId(card._id)
  }

  const handleEditSave = async () => {
    if (!editingId) return
    const card = cards.find(c => c._id === editingId)
    if (!card) return
    const { front, backs } = parseCardContent(editContent)
    await updateCard({
      ...card,
      front: { content: front },
      backs: backs.map(content => ({ content })),
    })
    setEditingId(null)
    load()
  }

  const handleExport = async () => {
    if (!deckId) return
    const data = await exportDeck(deckId)
    downloadJSON(data, `${slugify(data.deck.name) || 'deck'}-${todayStamp()}.json`)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Cleared before the await so picking the same file twice still fires change.
    e.target.value = ''
    if (!file) return
    setImportResult(null)
    try {
      const data = parseDeckExport(await file.text())
      if (data.cards.length === 0) {
        setImportError('That deck file has no readable cards in it.')
        return
      }
      setImportPreview(data)
    } catch (err) {
      setImportError((err as Error).message)
    }
  }

  const handleImportConfirm = async () => {
    if (!importPreview || !deckId) return
    setImporting(true)
    try {
      setImportResult(await importCards(deckId, importPreview))
      setImportPreview(null)
    } catch (err) {
      setImportError((err as Error).message)
    } finally {
      setImporting(false)
      load()
    }
  }

  const handleBulkImport = async () => {
    if (!bulkContent.trim() || !deckId || !bulkSeparator) return
    setBulkImporting(true)
    const lines = bulkContent.split('\n').filter(l => l.trim())
    for (const line of lines) {
      const parts = line.split(bulkSeparator).map(s => s.trim()).filter(Boolean)
      if (parts.length < 2) continue
      const raw = parts[0] + '\n---\n' + parts.slice(1).join('\n---\n')
      await createCard(deckId, raw)
    }
    setBulkContent('')
    setShowBulk(false)
    setBulkImporting(false)
    load()
  }

  const validBulkLineCount = bulkSeparator
    ? bulkContent.split('\n').filter(l => l.trim() && l.includes(bulkSeparator)).length
    : 0

  const dueCount = cards.filter(c => new Date(c.fsrs.due) <= new Date()).length

  if (!deck) return null

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl text-gray-800 font-semibold">{deck.name}</h1>
        <div className="ml-auto flex items-center gap-3">
          {dueCount > 0 && (
            <Link
              to={`/deck/${deckId}/study`}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              <Clock className="w-4 h-4" />
              Study ({dueCount})
            </Link>
          )}
          <button
            onClick={handleExport}
            title="Download this deck as JSON, review progress included"
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Add cards from a deck file, keeping their review progress"
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <FileUp className="w-4 h-4" />
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => setShowBulk(true)}
            title="Paste plain-text cards, one per line — these start with no review progress"
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            Bulk Import
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Card
          </button>
        </div>
      </div>

      {importResult && (
        <div className="flex items-start gap-2 mb-6 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          <div className="flex-1">
            <p>
              Imported {importResult.imported} card{importResult.imported !== 1 ? 's' : ''} with their review progress.
            </p>
            {importResult.progressReset > 0 && (
              <p className="text-green-700/80 mt-0.5">
                {importResult.progressReset} had no usable progress saved and start fresh.
              </p>
            )}
            {importResult.skipped > 0 && (
              <p className="text-amber-700 mt-0.5">
                {importResult.skipped} could not be written and were skipped.
              </p>
            )}
          </div>
          <button
            onClick={() => setImportResult(null)}
            className="text-green-600 hover:text-green-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {deck.description && (
        <p className="text-gray-500 mb-6">{deck.description}</p>
      )}

      {/* Import Error Modal */}
      {importError && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg border border-gray-300 p-6 w-full max-w-sm mx-4">
            <h2 className="text-lg text-gray-800 font-semibold mb-2">Import failed</h2>
            <p className="text-sm text-gray-600 mb-4">{importError}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setImportError(null)}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Confirm Modal */}
      {importPreview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg border border-gray-300 p-6 w-full max-w-md mx-4">
            <h2 className="text-lg text-gray-800 font-semibold mb-2">Import cards</h2>
            <p className="text-sm text-gray-600 mb-4">
              Adding <span className="font-medium">{importPreview.cards.length}</span> card
              {importPreview.cards.length !== 1 ? 's' : ''}
              {importPreview.deck.name && (
                <> from <span className="font-medium">{importPreview.deck.name}</span></>
              )}
              {' '}into <span className="font-medium">{deck.name}</span>. Cards already in this deck are left alone.
            </p>
            <ul className="text-sm text-gray-500 mb-4 space-y-1">
              <li>
                {importPreview.cards.filter(c => c.fsrs).length} arrive with their review progress intact.
              </li>
              {importPreview.cards.some(c => !c.fsrs) && (
                <li className="text-amber-700">
                  {importPreview.cards.filter(c => !c.fsrs).length} have no usable progress saved and will start fresh.
                </li>
              )}
            </ul>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setImportPreview(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleImportConfirm}
                disabled={importing}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 cursor-pointer disabled:opacity-50"
              >
                {importing ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Card Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg border border-gray-300 p-6 w-full max-w-lg mx-4">
            <h2 className="text-lg text-gray-800 font-semibold mb-2">Add Card</h2>
            <p className="text-sm text-gray-500 mb-4">
              Use <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">---</code> on its own line to separate front from back sides.
            </p>
            <textarea
              autoFocus
              placeholder={"hola\n---\nhello"}
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 outline-none focus:border-gray-400 resize-none font-mono text-sm"
              rows={6}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowCreate(false); setRawContent('') }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 cursor-pointer"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg border border-gray-300 p-6 w-full max-w-lg mx-4">
            <h2 className="text-lg text-gray-800 font-semibold mb-2">Bulk Import</h2>
            <p className="text-sm text-gray-500 mb-4">
              One card per line: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">front{bulkSeparator || ','} back{bulkSeparator || ','} back2{bulkSeparator || ','} ...</code>
            </p>
            <div className="flex items-center gap-2 mb-3">
              <label htmlFor="bulk-separator" className="text-sm text-gray-600 whitespace-nowrap">
                Field separator
              </label>
              <input
                id="bulk-separator"
                type="text"
                value={bulkSeparator}
                onChange={(e) => setBulkSeparator(e.target.value)}
                placeholder=","
                className="w-24 px-2 py-1 border border-gray-300 rounded font-mono text-sm outline-none focus:border-gray-400"
              />
              <span className="text-xs text-gray-400">
                Used to split each line into front/back fields
              </span>
            </div>
            <textarea
              autoFocus
              placeholder={`hola${bulkSeparator || ','} hello\nbonjour${bulkSeparator || ','} hello${bulkSeparator || ','} hi\ngracias${bulkSeparator || ','} thank you`}
              value={bulkContent}
              onChange={(e) => setBulkContent(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2 outline-none focus:border-gray-400 resize-none font-mono text-sm"
              rows={10}
            />
            <p className="text-xs text-gray-400 mb-4">
              {validBulkLineCount} valid card{validBulkLineCount !== 1 ? 's' : ''} detected
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowBulk(false); setBulkContent(''); setBulkSeparator(',') }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkImport}
                disabled={bulkImporting}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 cursor-pointer disabled:opacity-50"
              >
                {bulkImporting ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cards List */}
      {cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <CreditCard className="w-12 h-12 mb-4" />
          <p className="text-lg">No cards yet</p>
          <p className="text-sm">Add your first card to this deck</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {cards.map((card) => (
            <div
              key={card._id}
              className="shrink-0 flex flex-col rounded-lg border border-gray-300 bg-white pb-3 w-full"
            >
              <div className="shrink-0 flex items-center p-3 gap-2">
                <div className="text-gray-500 bg-gray-200 p-1 rounded">
                  <CreditCard className="w-4 h-4" />
                </div>
                {editingId === card._id ? (
                  <div className="flex-1">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded font-mono text-sm outline-none focus:border-gray-400 resize-none"
                      rows={4}
                    />
                    <div className="flex gap-1 mt-1">
                      <button onClick={handleEditSave} className="text-green-600 hover:text-green-700 cursor-pointer">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="text-gray-800 font-medium">{card.front.content}</span>
                    <div className="ml-auto flex items-center gap-2">
                      {new Date(card.fsrs.due) <= new Date() && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Due</span>
                      )}
                      <button
                        onClick={() => setStatsId(statsId === card._id ? null : card._id)}
                        className={`transition-colors cursor-pointer ${statsId === card._id ? 'text-gray-700' : 'text-gray-400 hover:text-gray-600'}`}
                      >
                        <BarChart3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleEditStart(card)}
                        className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(card._id)}
                        className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
              {editingId !== card._id && (
                <div className="px-3 flex flex-wrap gap-2">
                  {card.backs.map((back, i) => (
                    <span key={i} className="text-sm text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded">
                      {back.content}
                    </span>
                  ))}
                </div>
              )}
              {statsId === card._id && (
                <div className="mx-3 mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-gray-400 text-xs uppercase tracking-wide">Next Due</p>
                      <p className="text-gray-700 font-medium">
                        {formatDueIn(card.fsrs.due)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs uppercase tracking-wide">Reviews</p>
                      <p className="text-gray-700 font-medium">{card.fsrs.reps}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs uppercase tracking-wide">Lapses</p>
                      <p className="text-gray-700 font-medium">{card.fsrs.lapses}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs uppercase tracking-wide">State</p>
                      <p className="text-gray-700 font-medium">{State[card.fsrs.state]}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs uppercase tracking-wide">Stability</p>
                      <p className="text-gray-700 font-medium">{card.fsrs.stability.toFixed(2)}d</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs uppercase tracking-wide">Difficulty</p>
                      <p className="text-gray-700 font-medium">{card.fsrs.difficulty.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs uppercase tracking-wide">Correct</p>
                      <p className="text-gray-700 font-medium">
                        {card.fsrs.reps > 0 ? card.fsrs.reps - card.fsrs.lapses : 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs uppercase tracking-wide">Accuracy</p>
                      <p className="text-gray-700 font-medium">
                        {card.fsrs.reps > 0
                          ? `${Math.round(((card.fsrs.reps - card.fsrs.lapses) / card.fsrs.reps) * 100)}%`
                          : '--'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
