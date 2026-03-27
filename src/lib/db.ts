import { openDB, type IDBPDatabase } from 'idb'
import type { Deck, FlashCard } from './types'
import { createEmptyCard } from 'ts-fsrs'

interface CardflashsDB {
  decks: { key: string; value: Deck }
  cards: { key: string; value: FlashCard; indexes: { 'by-deck': string } }
}

let dbPromise: Promise<IDBPDatabase<CardflashsDB>>

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<CardflashsDB>('cardflashs', 1, {
      upgrade(db) {
        db.createObjectStore('decks', { keyPath: '_id' })
        const cardStore = db.createObjectStore('cards', { keyPath: '_id' })
        cardStore.createIndex('by-deck', 'deckId')
      },
    })
  }
  return dbPromise
}

// --- Deck operations ---

export async function createDeck(name: string, description = ''): Promise<Deck> {
  const now = new Date().toISOString()
  const deck: Deck = {
    _id: `deck_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'deck',
    name,
    description,
    createdAt: now,
    updatedAt: now,
  }
  const db = await getDB()
  await db.put('decks', deck)
  return deck
}

export async function getAllDecks(): Promise<Deck[]> {
  const db = await getDB()
  return db.getAll('decks')
}

export async function getDeck(id: string): Promise<Deck> {
  const db = await getDB()
  const deck = await db.get('decks', id)
  if (!deck) throw new Error(`Deck not found: ${id}`)
  return deck
}

export async function updateDeck(deck: Deck): Promise<Deck> {
  const updated = { ...deck, updatedAt: new Date().toISOString() }
  const db = await getDB()
  await db.put('decks', updated)
  return updated
}

export async function deleteDeck(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('decks', id)
  const cards = await getCardsForDeck(id)
  const tx = db.transaction('cards', 'readwrite')
  await Promise.all(cards.map(c => tx.store.delete(c._id)))
  await tx.done
}

// --- Card operations ---

export function parseCardContent(raw: string): { front: string; backs: string[] } {
  const parts = raw.split(/^---$/m).map(s => s.trim())
  return {
    front: parts[0] || '',
    backs: parts.slice(1).filter(Boolean),
  }
}

export async function createCard(deckId: string, raw: string): Promise<FlashCard> {
  const { front, backs } = parseCardContent(raw)
  const now = new Date().toISOString()
  const card: FlashCard = {
    _id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'card',
    deckId,
    front: { content: front },
    backs: backs.map(content => ({ content })),
    fsrs: createEmptyCard(),
    createdAt: now,
    updatedAt: now,
  }
  const db = await getDB()
  await db.put('cards', card)
  return card
}

export async function getCardsForDeck(deckId: string): Promise<FlashCard[]> {
  const db = await getDB()
  return db.getAllFromIndex('cards', 'by-deck', deckId)
}

export async function updateCard(card: FlashCard): Promise<FlashCard> {
  const updated = { ...card, updatedAt: new Date().toISOString() }
  const db = await getDB()
  await db.put('cards', updated)
  return updated
}

export async function deleteCard(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('cards', id)
}

export async function getCard(id: string): Promise<FlashCard> {
  const db = await getDB()
  const card = await db.get('cards', id)
  if (!card) throw new Error(`Card not found: ${id}`)
  return card
}

export async function getDueCardsForDeck(deckId: string): Promise<FlashCard[]> {
  const cards = await getCardsForDeck(deckId)
  const now = new Date()
  return cards.filter(c => new Date(c.fsrs.due) <= now)
}

export async function countCardsForDeck(deckId: string): Promise<{ total: number; due: number }> {
  const cards = await getCardsForDeck(deckId)
  const now = new Date()
  const due = cards.filter(c => new Date(c.fsrs.due) <= now).length
  return { total: cards.length, due }
}
