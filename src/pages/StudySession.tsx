import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, RotateCcw, Eye } from 'lucide-react'
import { getDeck, getDueCardsForDeck } from '../lib/db'
import { reviewAndSave } from '../lib/scheduler'
import { Rating } from 'ts-fsrs'
import type { Deck, FlashCard } from '../lib/types'

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
  const [cards, setCards] = useState<FlashCard[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [finished, setFinished] = useState(false)

  const load = async () => {
    if (!deckId) return
    const [d, c] = await Promise.all([getDeck(deckId), getDueCardsForDeck(deckId)])
    setDeck(d)
    if (c.length === 0) {
      setFinished(true)
    } else {
      setCards(c)
    }
  }

  useEffect(() => { load() }, [deckId])

  const currentCard = cards[currentIndex]

  const handleGrade = useCallback(async (grade: Rating) => {
    if (!currentCard) return
    await reviewAndSave(currentCard, grade)
    if (currentIndex + 1 >= cards.length) {
      setFinished(true)
    } else {
      setCurrentIndex(prev => prev + 1)
      setRevealed(false)
    }
  }, [currentCard, currentIndex, cards.length])

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
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [revealed, handleGrade])

  if (!deck) return null

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link to={`/deck/${deckId}`} className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl text-gray-800 font-semibold">Studying: {deck.name}</h1>
        {!finished && (
          <span className="ml-auto text-sm text-gray-500">
            {currentIndex + 1} / {cards.length}
          </span>
        )}
      </div>

      {finished ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="text-gray-500 bg-gray-200 p-3 rounded-full mb-4">
            <RotateCcw className="w-8 h-8" />
          </div>
          <h2 className="text-xl text-gray-800 font-semibold mb-2">All done!</h2>
          <p className="text-gray-500 mb-6">No more cards due for review.</p>
          <button
            onClick={() => navigate(`/deck/${deckId}`)}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 cursor-pointer"
          >
            Back to Deck
          </button>
        </div>
      ) : currentCard ? (
        <div className="shrink-0 flex flex-col rounded-lg border border-gray-300 bg-white w-full">
          {/* Front */}
          <div className="p-8 text-center">
            <p className="text-sm text-gray-400 uppercase tracking-wide mb-3">Front</p>
            <p className="text-2xl text-gray-800 font-medium">{currentCard.front.content}</p>
          </div>

          {/* Reveal / Back */}
          {!revealed ? (
            <div className="border-t border-gray-200 p-6 flex justify-center">
              <button
                onClick={() => setRevealed(true)}
                className="flex items-center gap-2 px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
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
                  {currentCard.backs.map((back, i) => (
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
                Keyboard: 1 Again &middot; 2 Hard &middot; 3 Good &middot; 4 Easy
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
