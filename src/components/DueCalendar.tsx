import { useEffect, useState } from 'react'
import { getCardsForDeck } from '../lib/db'
import { useAuth } from '../lib/useAuth'

interface Props {
  deckId: string
}

function getDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function buildCalendarGrid(): { date: Date; key: string }[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Start from the Sunday of 26 weeks ago
  const start = new Date(today)
  start.setDate(start.getDate() - (26 * 7) - start.getDay())

  // End at the Saturday after 26 weeks from now
  const end = new Date(today)
  end.setDate(end.getDate() + (26 * 7) + (6 - end.getDay()))

  const days: { date: Date; key: string }[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    days.push({ date: new Date(cursor), key: getDayKey(cursor) })
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

function getIntensity(count: number, max: number): string {
  if (count === 0) return 'bg-gray-100'
  const ratio = count / max
  if (ratio <= 0.25) return 'bg-green-200'
  if (ratio <= 0.5) return 'bg-green-400'
  if (ratio <= 0.75) return 'bg-green-500'
  return 'bg-green-700'
}

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

export default function DueCalendar({ deckId }: Props) {
  const [dueCounts, setDueCounts] = useState<Record<string, number>>({})
  const { auth } = useAuth()
  const userKey = auth?.decoded.sub ?? 'anon'

  useEffect(() => {
    getCardsForDeck(deckId).then(cards => {
      const counts: Record<string, number> = {}
      for (const card of cards) {
        const key = getDayKey(new Date(card.fsrs.due))
        counts[key] = (counts[key] || 0) + 1
      }
      setDueCounts(counts)
    })
  }, [deckId, userKey])

  const grid = buildCalendarGrid()
  const maxCount = Math.max(1, ...Object.values(dueCounts))

  // Group days into weeks (columns)
  const weeks: { date: Date; key: string }[][] = []
  for (let i = 0; i < grid.length; i += 7) {
    weeks.push(grid.slice(i, i + 7))
  }

  // Month labels
  const monthLabels: { label: string; col: number }[] = []
  let lastMonth = -1
  weeks.forEach((week, i) => {
    const firstDay = week[0]
    const m = firstDay.date.getMonth()
    if (m !== lastMonth) {
      monthLabels.push({
        label: firstDay.date.toLocaleString(undefined, { month: 'short' }),
        col: i,
      })
      lastMonth = m
    }
  })

  const todayKey = getDayKey(new Date())

  return (
    <div className="px-3 pb-1 overflow-x-auto">
      <div className="inline-flex flex-col gap-0.5 min-w-0">
        {/* Month labels */}
        <div className="flex ml-7">
          {monthLabels.map(({ label, col }, i) => {
            const nextCol = monthLabels[i + 1]?.col ?? weeks.length
            const span = nextCol - col
            return (
              <span
                key={`${label}-${col}`}
                className="text-[10px] text-gray-400"
                style={{ width: `${span * 13}px`, flexShrink: 0 }}
              >
                {label}
              </span>
            )
          })}
        </div>
        {/* Grid */}
        <div className="flex gap-0.5">
          {/* Day labels */}
          <div className="flex flex-col gap-0.5 mr-1">
            {DAY_LABELS.map((label, i) => (
              <span key={i} className="text-[10px] text-gray-400 h-[11px] leading-[11px] w-5 text-right">
                {label}
              </span>
            ))}
          </div>
          {/* Weeks */}
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {week.map(({ key }) => {
                const count = dueCounts[key] || 0
                const isToday = key === todayKey
                return (
                  <div
                    key={key}
                    title={`${key}: ${count} card${count !== 1 ? 's' : ''} due`}
                    className={`w-[11px] h-[11px] rounded-[2px] ${getIntensity(count, maxCount)} ${isToday ? 'ring-1 ring-gray-800' : ''}`}
                  />
                )
              })}
            </div>
          ))}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-1 mt-1 ml-7">
          <span className="text-[10px] text-gray-400 mr-0.5">Less</span>
          <div className="w-[11px] h-[11px] rounded-[2px] bg-gray-100" />
          <div className="w-[11px] h-[11px] rounded-[2px] bg-green-200" />
          <div className="w-[11px] h-[11px] rounded-[2px] bg-green-400" />
          <div className="w-[11px] h-[11px] rounded-[2px] bg-green-500" />
          <div className="w-[11px] h-[11px] rounded-[2px] bg-green-700" />
          <span className="text-[10px] text-gray-400 ml-0.5">More</span>
        </div>
      </div>
    </div>
  )
}
