import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, RotateCcw, Eye, SkipForward, Trash2 } from 'lucide-react'
import { getDeck, getNextTrainable, resetCard, deleteCard } from '../lib/db'
import { reviewAndSave } from '../lib/scheduler'
import { Rating, type Grade } from 'ts-fsrs'
import type { Deck, FlashCard } from '../lib/types'
import { useAuth } from '../lib/useAuth'
import ThemeToggle from '../components/ThemeToggle'

const GRADE_BUTTONS = [
  { grade: Rating.Again, label: 'Again', color: 'bg-red-500 hover:bg-red-600' },
  { grade: Rating.Hard, label: 'Hard', color: 'bg-orange-500 hover:bg-orange-600' },
  { grade: Rating.Good, label: 'Good', color: 'bg-green-500 hover:bg-green-600' },
  { grade: Rating.Easy, label: 'Easy', color: 'bg-blue-500 hover:bg-blue-600' },
] as const

export default function StudySession() {
  const { deckId } = useParams<{ deckId: string }>()
  const navigate = useNavigate()
  const [deck, setDeck] = useState<Deck | null>(null)
  const [card, setCard] = useState<FlashCard | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [reviewed, setReviewed] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [finished, setFinished] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // Cards set aside for this session (skipped or reset). They're excluded from
  // getNextTrainable so it doesn't hand the same card straight back.
  const skipped = useRef<Set<string>>(new Set())
  const { auth } = useAuth()
  const userKey = auth?.user.uid ?? 'anon'

  // Re-ask the data layer for the next due card rather than stepping an index —
  // this is the chessrepeat model, where "next" is recomputed from live state
  // (see getNextTrainable in lib/db.ts).
  const loadNext = useCallback(async () => {
    if (!deckId) return
    const { next, remaining } = await getNextTrainable(deckId, 'recall', skipped.current)
    setRemaining(remaining)
    setRevealed(false)
    setConfirmingDelete(false)
    if (next) {
      setCard(next)
      setFinished(false)
    } else {
      setCard(null)
      setFinished(true)
    }
  }, [deckId])

  useEffect(() => {
    if (!deckId) return
    let active = true
    getDeck(deckId).then(d => { if (active) setDeck(d) })
    return () => { active = false }
  }, [deckId, userKey])

  useEffect(() => { loadNext() }, [loadNext])

  const handleGrade = useCallback(async (grade: Grade) => {
    if (!card) return
    await reviewAndSave(card, grade)
    setReviewed(n => n + 1)
    loadNext()
  }, [card, loadNext])

  const handleSkip = useCallback(() => {
    if (!card) return
    skipped.current.add(card._id)
    loadNext()
  }, [card, loadNext])

  const handleReset = useCallback(async () => {
    if (!card) return
    await resetCard(card)
    // Set aside too, so a card reset for later doesn't reappear this session.
    skipped.current.add(card._id)
    loadNext()
  }, [card, loadNext])

  const handleDelete = useCallback(async () => {
    if (!card) return
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    await deleteCard(card._id)
    loadNext()
  }, [card, confirmingDelete, loadNext])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (!revealed) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          setRevealed(true)
        }
      } else {
        if (e.key === '1') handleGrade(Rating.Again)
        else if (e.key === '2') handleGrade(Rating.Hard)
        else if (e.key === '3') handleGrade(Rating.Good)
        else if (e.key === '4') handleGrade(Rating.Easy)
      }
      if (e.key.toLowerCase() === 's') handleSkip()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [revealed, handleGrade, handleSkip])

  if (!deck) return null

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link to={`/deck/${deckId}`} className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl text-gray-800 font-semibold">Studying: {deck.name}</h1>
        <div className="ml-auto flex items-center gap-3">
          {!finished && (
            <span className="text-sm text-gray-500">{remaining} left</span>
          )}
          <ThemeToggle />
        </div>
      </div>

      {finished ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="text-gray-500 bg-gray-200 p-3 rounded-full mb-4">
            <RotateCcw className="w-8 h-8" />
          </div>
          <h2 className="text-xl text-gray-800 font-semibold mb-2">All done!</h2>
          <p className="text-gray-500 mb-6">
            No more cards due for review{reviewed > 0 ? ` — ${reviewed} reviewed` : ''}.
          </p>
          <button
            onClick={() => navigate(`/deck/${deckId}`)}
            className="px-4 py-2 bg-accent text-on-accent rounded-lg hover:bg-accent-strong cursor-pointer"
          >
            Back to Deck
          </button>
        </div>
      ) : card ? (
        <div className="shrink-0 flex flex-col rounded-lg border-2 border-line bg-surface w-full">
          {/* Card actions */}
          <div className="flex justify-end gap-2 px-4 pt-3">
            <button
              onClick={handleSkip}
              title="Skip this card for now without changing its state (S)"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md cursor-pointer transition-colors"
            >
              <SkipForward className="w-3.5 h-3.5" />
              Skip
            </button>
            <button
              onClick={handleReset}
              title="Reset learning state for this card"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
            <button
              onClick={handleDelete}
              onBlur={() => setConfirmingDelete(false)}
              title="Delete this card permanently"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md cursor-pointer transition-colors ${
                confirmingDelete
                  ? 'text-on-accent bg-red-600 hover:bg-red-600'
                  : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {confirmingDelete ? 'Confirm?' : 'Delete'}
            </button>
          </div>

          {/* Front */}
          <div className="p-8 text-center">
            <p className="text-sm text-gray-400 uppercase tracking-wide mb-3">Front</p>
            <p className="text-2xl text-gray-800 font-medium">{card.front.content}</p>
          </div>

          {/* Reveal / Back */}
          {!revealed ? (
            <div className="border-t border-gray-200 p-6 flex justify-center">
              <button
                onClick={() => setRevealed(true)}
                className="flex items-center gap-2 px-6 py-3 bg-accent text-on-accent rounded-lg hover:bg-accent-strong transition-colors cursor-pointer"
              >
                <Eye className="w-4 h-4" />
                Show Answer
              </button>
            </div>
          ) : (
            <>
              <div className="border-t border-gray-200 p-8">
                <p className="text-sm text-gray-400 uppercase tracking-wide mb-3 text-center">Back</p>
                <div className="flex flex-col gap-3 items-center">
                  {card.backs.map((back, i) => (
                    <div
                      key={i}
                      className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-lg text-gray-700"
                    >
                      {back.content}
                    </div>
                  ))}
                </div>
              </div>

              {/* Grade Buttons */}
              <div className="border-t border-gray-200 p-4 flex justify-center gap-3">
                {GRADE_BUTTONS.map(({ grade, label, color }) => (
                  <button
                    key={grade}
                    onClick={() => handleGrade(grade)}
                    className={`px-5 py-2.5 text-white rounded-lg transition-colors cursor-pointer ${color}`}
                  >
                    <span className="text-sm font-medium">{label}</span>
                    <span className="block text-xs opacity-75">{grade}</span>
                  </button>
                ))}
              </div>
              <p className="text-center text-xs text-gray-400 pb-3">
                Keyboard: 1 Again &middot; 2 Hard &middot; 3 Good &middot; 4 Easy &middot; S Skip
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
