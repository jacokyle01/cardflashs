import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Clock, CreditCard, Pencil, Check, X, BarChart3 } from 'lucide-react'
import { State } from 'ts-fsrs'
import { getDeck, getCardsForDeck, createCard, deleteCard, updateCard } from '../lib/db'
import { parseCardContent } from '../lib/db'
import type { Deck, FlashCard } from '../lib/types'

export default function DeckView() {
  const { deckId } = useParams<{ deckId: string }>()
  const [deck, setDeck] = useState<Deck | null>(null)
  const [cards, setCards] = useState<FlashCard[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [rawContent, setRawContent] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [statsId, setStatsId] = useState<string | null>(null)

  const load = async () => {
    if (!deckId) return
    const [d, c] = await Promise.all([getDeck(deckId), getCardsForDeck(deckId)])
    setDeck(d)
    setCards(c)
  }

  //TODO we should get all decks on page load?
  useEffect(() => { load() }, [deckId])

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
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Card
          </button>
        </div>
      </div>

      {deck.description && (
        <p className="text-gray-500 mb-6">{deck.description}</p>
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
                        {new Date(card.fsrs.due) <= new Date()
                          ? 'Now'
                          : new Date(card.fsrs.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
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
