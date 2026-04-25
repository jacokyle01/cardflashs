import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layers, Plus, Trash2, BookOpen, Clock, Settings, CalendarDays } from 'lucide-react'
import { getAllDecks, createDeck, deleteDeck, countCardsForDeck, getLocalDB } from '../lib/db'
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
