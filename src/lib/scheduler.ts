import { fsrs, type Grade, type Card as FSRSCard, type FSRS } from 'ts-fsrs'
import type { FlashCard } from './types'
import { updateCard, getFSRSParams } from './db'

let cachedFSRS: FSRS | null = null

export async function getScheduler(): Promise<FSRS> {
  const params = await getFSRSParams()
  cachedFSRS = fsrs(params)
  return cachedFSRS
}

export function reviewCard(f: FSRS, card: FlashCard, grade: Grade): { updatedCard: FlashCard } {
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
  const f = await getScheduler()
  const { updatedCard } = reviewCard(f, card, grade)
  await updateCard(updatedCard)
  return updatedCard
}

export function clearSchedulerCache() {
  cachedFSRS = null
}
