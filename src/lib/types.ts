import type { Card as FSRSCard } from 'ts-fsrs'

export interface Deck {
  _id: string
  type: 'deck'
  name: string
  description: string
  createdAt: string
  updatedAt: string
}

export interface CardSide {
  content: string
}

export interface FlashCard {
  _id: string
  type: 'card'
  deckId: string
  front: CardSide
  backs: CardSide[]
  fsrs: FSRSCard
  createdAt: string
  updatedAt: string
}

export type Doc = Deck | FlashCard
