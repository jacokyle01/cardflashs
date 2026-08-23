import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layers, Plus, Trash2, BookOpen, Clock, Settings, CalendarDays, Download, FileUp, X } from 'lucide-react'
import {
  getAllDecks, createDeck, deleteDeck, countCardsForDeck, getLocalDB,
  exportAllDecks, parseCollectionExport, importCollection,
  type CollectionExport, type CollectionImportResult,
} from '../lib/db'
import { downloadJSON, todayStamp } from '../lib/download'
import type { Deck } from '../lib/types'
import DueCalendar from '../components/DueCalendar'
import AuthButton from '../components/AuthButton'
import { useAuth } from '../lib/useAuth'

interface DeckWithCounts extends Deck {
  total: number
  due: number
}

export default function Dashboard() {
  const [decks, setDecks] = useState<DeckWithCounts[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [calendarDeckId, setCalendarDeckId] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<CollectionExport | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<CollectionImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [mergeByName, setMergeByName] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { auth } = useAuth()
  const userKey = auth?.decoded.sub ?? 'anon'

  const loadDecks = async () => {
    const allDecks = await getAllDecks()
    const withCounts = await Promise.all(
      allDecks.map(async (d) => {
        const counts = await countCardsForDeck(d._id)
        return { ...d, ...counts }
      })
    )
    setDecks(withCounts)
  }

  useEffect(() => {
    loadDecks()
    const changes = getLocalDB().changes({ since: 'now', live: true })
      .on('change', () => loadDecks())
    return () => changes.cancel()
  }, [userKey])

  const handleCreate = async () => {
    if (!newName.trim()) return
    await createDeck(newName.trim(), newDesc.trim())
    setNewName('')
    setNewDesc('')
    setShowCreate(false)
    loadDecks()
  }

  const handleExportAll = async () => {
    const data = await exportAllDecks()
    downloadJSON(data, `cardflashs-${todayStamp()}.json`)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Cleared before the await so picking the same file twice still fires change.
    e.target.value = ''
    if (!file) return
    setImportResult(null)
    try {
      const data = parseCollectionExport(await file.text())
      if (data.decks.length === 0) {
        setImportError('That file has no readable decks in it.')
        return
      }
      setMergeByName(false)
      setImportPreview(data)
    } catch (err) {
      setImportError((err as Error).message)
    }
  }

  const handleImportConfirm = async () => {
    if (!importPreview) return
    setImporting(true)
    try {
      setImportResult(await importCollection(importPreview, { mergeByName }))
      setImportPreview(null)
    } catch (err) {
      setImportError((err as Error).message)
    } finally {
      setImporting(false)
      loadDecks()
    }
  }

  const handleDelete = async (id: string) => {
    await deleteDeck(id)
    loadDecks()
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="text-gray-500 bg-gray-200 p-2 rounded">
            <Layers className="w-6 h-6" />
          </div>
          <h1 className="text-2xl text-gray-800 font-semibold">Cardflashs</h1>
        </div>
        <div className="flex items-center gap-2">
          <AuthButton />
          {decks.length > 0 && (
            <button
              onClick={handleExportAll}
              title="Download every deck as one JSON file, review progress included"
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Export All
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Restore decks from a collection file, review progress included"
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <FileUp className="w-4 h-4" />
            Import All
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            className="hidden"
          />
          <Link
            to="/settings"
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Settings className="w-5 h-5" />
          </Link>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Deck
          </button>
        </div>
      </div>

      {importResult && (
        <div className="flex items-start gap-2 mb-6 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          <div className="flex-1">
            <p>
              Imported {importResult.imported} card{importResult.imported !== 1 ? 's' : ''} into{' '}
              {importResult.decksCreated + importResult.decksMerged} deck
              {importResult.decksCreated + importResult.decksMerged !== 1 ? 's' : ''}
              {importResult.decksMerged > 0 && (
                <> ({importResult.decksCreated} created, {importResult.decksMerged} merged)</>
              )}
              , review progress included.
            </p>
            {importResult.progressReset > 0 && (
              <p className="text-green-700/80 mt-0.5">
                {importResult.progressReset} card{importResult.progressReset !== 1 ? 's' : ''} had no usable progress saved and start fresh.
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
      {importPreview && (() => {
        const cardCount = importPreview.decks.reduce((n, d) => n + d.cards.length, 0)
        const freshCount = importPreview.decks.reduce(
          (n, d) => n + d.cards.filter(c => !c.fsrs).length, 0
        )
        const existingNames = new Set(decks.map(d => d.name))
        const matching = importPreview.decks.filter(d => existingNames.has(d.name)).length
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg border border-gray-300 p-6 w-full max-w-md mx-4">
              <h2 className="text-lg text-gray-800 font-semibold mb-2">Import collection</h2>
              <p className="text-sm text-gray-600 mb-4">
                <span className="font-medium">{importPreview.decks.length}</span> deck
                {importPreview.decks.length !== 1 ? 's' : ''} and{' '}
                <span className="font-medium">{cardCount}</span> card{cardCount !== 1 ? 's' : ''}
                {importPreview.exportedAt && (
                  <>, exported {new Date(importPreview.exportedAt).toLocaleDateString()}</>
                )}
                .
              </p>

              <div className="space-y-2 mb-4">
                <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    checked={!mergeByName}
                    onChange={() => setMergeByName(false)}
                    className="mt-1 cursor-pointer"
                  />
                  <span>
                    Create new decks
                    <span className="block text-xs text-gray-400">
                      Everything arrives fresh, alongside what you already have.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    checked={mergeByName}
                    onChange={() => setMergeByName(true)}
                    className="mt-1 cursor-pointer"
                  />
                  <span>
                    Merge into decks with the same name
                    <span className="block text-xs text-gray-400">
                      {matching > 0
                        ? `${matching} of these match a deck you already have; the rest are created.`
                        : 'No names match right now, so every deck would be created.'}
                    </span>
                  </span>
                </label>
              </div>

              <p className="text-xs text-gray-400 mb-4">
                Cards are always added, never replaced — nothing you already have is changed or removed.
                {freshCount > 0 && ` ${freshCount} card${freshCount !== 1 ? 's' : ''} in this file have no usable progress saved and will start fresh.`}
              </p>

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
        )
      })()}

      {/* Create Deck Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg border border-gray-300 p-6 w-full max-w-md mx-4">
            <h2 className="text-lg text-gray-800 font-semibold mb-4">Create New Deck</h2>
            <input
              autoFocus
              type="text"
              placeholder="Deck name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3 outline-none focus:border-gray-400"
            />
            <textarea
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 outline-none focus:border-gray-400 resize-none"
              rows={2}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowCreate(false); setNewName(''); setNewDesc('') }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 cursor-pointer"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deck List */}
      {decks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Layers className="w-12 h-12 mb-4" />
          <p className="text-lg">No decks yet</p>
          <p className="text-sm">Create your first deck to get started</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {decks.map((deck) => (
            <div
              key={deck._id}
              className="shrink-0 flex flex-col rounded-lg border border-gray-300 bg-white pb-3 w-full"
            >
              <div className="shrink-0 flex items-center p-3 gap-2">
                <div className="text-gray-500 bg-gray-200 p-1 rounded">
                  <BookOpen className="w-5 h-5" />
                </div>
                <Link
                  to={`/deck/${deck._id}`}
                  className="text-lg text-gray-800 font-semibold hover:underline"
                >
                  {deck.name}
                </Link>
                <div className="ml-auto flex items-center gap-3">
                  {deck.due > 0 && (
                    <Link
                      to={`/deck/${deck._id}/study`}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      Study ({deck.due})
                    </Link>
                  )}
                  <button
                    onClick={() => setCalendarDeckId(calendarDeckId === deck._id ? null : deck._id)}
                    className={`transition-colors cursor-pointer ${calendarDeckId === deck._id ? 'text-gray-700' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <CalendarDays className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(deck._id)}
                    className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {deck.description && (
                <p className="px-3 text-sm text-gray-500">{deck.description}</p>
              )}
              <div className="px-3 pt-2 flex items-center gap-4 text-sm text-gray-500">
                <span>{deck.total} card{deck.total !== 1 ? 's' : ''}</span>
                <span>{deck.due} due</span>
              </div>
              {calendarDeckId === deck._id && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <DueCalendar deckId={deck._id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
