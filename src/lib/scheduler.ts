import { fsrs, type Grade, type Card as FSRSCard } from 'ts-fsrs'
import type { FlashCard } from './types'
import { updateCard } from './db'

const f = fsrs({})

export function reviewCard(card: FlashCard, grade: Grade): { updatedCard: FlashCard } {
  const now = new Date()
  const result = f.next(card.fsrs as FSRSCard, now, grade)
  const updatedCard: FlashCard = {
    ...card,
    fsrs: result.card,
    updatedAt: now.toISOString(),
  }
  return { updatedCard }
}

export async function reviewAndSave(card: FlashCard, grade: Grade): Promise<FlashCard> {
  const { updatedCard } = reviewCard(card, grade)
  await updateCard(updatedCard)
  return updatedCard
}
