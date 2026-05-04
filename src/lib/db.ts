import PouchDB from './pouch'
import type { Deck, FlashCard } from './types'
import { createEmptyCard, generatorParameters, type FSRSParameters } from 'ts-fsrs'

// Loose generic so Deck / FlashCard / SettingsDoc — none of which carry an
// index signature — can be passed straight to db.put without casts.
type AnyPouch = PouchDB.Database

interface SettingsDoc {
  _id: 'settings:fsrs_params'
  _rev?: string
  type: 'settings'
  value: FSRSParameters
}

// One local DB regardless of auth state. Signing in attaches remote sync on
// top of this DB; signing out detaches it. Cards created while signed out
// stay visible when you sign in, and replicate up to the user's CouchDB DB
// the first time sync attaches.
let localDB: AnyPouch | null = null

export function getLocalDB(): AnyPouch {
  if (!localDB) {
    localDB = new PouchDB('cardflashs')
    void localDB.createIndex({ index: { fields: ['type', 'deckId'] } }).catch(() => {})
  }
  return localDB
}

// --- Settings operations ---

export async function getFSRSParams(): Promise<FSRSParameters> {
  const db = getLocalDB()
  try {
    const doc = await db.get<SettingsDoc>('settings:fsrs_params')
    return doc.value
  } catch (err) {
    if ((err as { status?: number }).status === 404) return generatorParameters({ enable_short_term: false })
    throw err
  }
}

export async function saveFSRSParams(params: Partial<FSRSParameters>): Promise<FSRSParameters> {
  const full = generatorParameters(params)
  const db = getLocalDB()
  let rev: string | undefined
  try {
    const existing = await db.get<SettingsDoc>('settings:fsrs_params')
    rev = existing._rev
  } catch (err) {
    if ((err as { status?: number }).status !== 404) throw err
  }
  await db.put({
    _id: 'settings:fsrs_params',
    _rev: rev,
    type: 'settings',
    value: full,
  })
  return full
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
  const db = getLocalDB()
  const res = await db.put(deck)
  return { ...deck, _rev: res.rev }
}

export async function getAllDecks(): Promise<Deck[]> {
  const db = getLocalDB()
  // PouchDB-find defaults to limit: 25; pass an explicit high limit so larger
  // collections aren't silently truncated. Cap at 2^32-1 — IndexedDB's
  // getAll() rejects values outside unsigned long.
  const res = await db.find({
    selector: { type: 'deck' },
    limit: 0xffffffff,
  })
  return res.docs as unknown as Deck[]
}

export async function getDeck(id: string): Promise<Deck> {
  const db = getLocalDB()
  try {
    const doc = await db.get<Deck>(id)
    return doc as unknown as Deck
  } catch {
    throw new Error(`Deck not found: ${id}`)
  }
}

export async function updateDeck(deck: Deck): Promise<Deck> {
  const updated = { ...deck, updatedAt: new Date().toISOString() }
  const db = getLocalDB()
  const res = await db.put(updated)
  return { ...updated, _rev: res.rev }
}

export async function deleteDeck(id: string): Promise<void> {
  const db = getLocalDB()
  const deck = await db.get<Deck>(id)
  await db.remove(deck as unknown as PouchDB.Core.RemoveDocument)
  const cards = await getCardsForDeck(id)
  await Promise.all(
    cards.map(c =>
      db.remove({ _id: c._id, _rev: c._rev! } as PouchDB.Core.RemoveDocument)
    )
  )
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
  const db = getLocalDB()
  const res = await db.put(card)
  return { ...card, _rev: res.rev }
}

export async function getCardsForDeck(deckId: string): Promise<FlashCard[]> {
  const db = getLocalDB()
  const res = await db.find({
    selector: { type: 'card', deckId },
    limit: 0xffffffff,
  })
  return res.docs as unknown as FlashCard[]
}

export async function updateCard(card: FlashCard): Promise<FlashCard> {
  const updated = { ...card, updatedAt: new Date().toISOString() }
  const db = getLocalDB()
  const res = await db.put(updated)
  return { ...updated, _rev: res.rev }
}

export async function resetCard(card: FlashCard): Promise<FlashCard> {
  return updateCard({ ...card, fsrs: createEmptyCard() })
}

export async function deleteCard(id: string): Promise<void> {
  const db = getLocalDB()
  const card = await db.get<FlashCard>(id)
  await db.remove(card as unknown as PouchDB.Core.RemoveDocument)
}

export async function getCard(id: string): Promise<FlashCard> {
  const db = getLocalDB()
  try {
    const doc = await db.get<FlashCard>(id)
    return doc as unknown as FlashCard
  } catch {
    throw new Error(`Card not found: ${id}`)
  }
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
