import PouchDB from './pouch'
import type { Deck, FlashCard, CardSide } from './types'
import { createEmptyCard, generatorParameters, type FSRSParameters, type Card as FSRSCard } from 'ts-fsrs'

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

// --- Export / import ---

// Deck files are JSON rather than the line-based text Bulk Import accepts,
// because the point is to carry the `fsrs` block across. A re-imported card
// keeps its due date, stability and review counts instead of starting over
// as a new card.

export const EXPORT_FORMAT = 'cardflashs-deck'
export const EXPORT_VERSION = 1

// A whole-collection backup is a distinct format rather than an array of deck
// files, so the per-deck Import button can tell the two apart and say which
// one it was handed.
export const COLLECTION_FORMAT = 'cardflashs-collection'
export const COLLECTION_VERSION = 1

export interface ExportedCard {
  front: CardSide
  backs: CardSide[]
  // Null when the file carried no usable scheduling state; importCards turns
  // that into a fresh card and reports how many it had to reset.
  fsrs: FSRSCard | null
  createdAt: string
  updatedAt: string
}

export interface DeckExport {
  format: string
  version: number
  exportedAt: string
  deck: { name: string; description: string }
  cards: ExportedCard[]
}

export interface ExportedDeck {
  name: string
  description: string
  cards: ExportedCard[]
}

export interface CollectionExport {
  format: string
  version: number
  exportedAt: string
  decks: ExportedDeck[]
}

export interface CollectionImportResult extends ImportResult {
  decksCreated: number
  decksMerged: number
}

export interface ImportResult {
  imported: number
  skipped: number
  progressReset: number
}

function toExportedCard(c: FlashCard): ExportedCard {
  return {
    front: c.front,
    backs: c.backs,
    fsrs: c.fsrs,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }
}

export async function exportDeck(deckId: string): Promise<DeckExport> {
  const [deck, cards] = await Promise.all([getDeck(deckId), getCardsForDeck(deckId)])
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    deck: { name: deck.name, description: deck.description },
    cards: cards.map(toExportedCard),
  }
}

// Every card in one query, grouped in memory, rather than a getCardsForDeck
// round trip per deck. Cards pointing at a deck that no longer exists are
// dropped — they're already invisible everywhere else in the app.
export async function exportAllDecks(): Promise<CollectionExport> {
  const db = getLocalDB()
  const [decks, res] = await Promise.all([
    getAllDecks(),
    db.find({ selector: { type: 'card' }, limit: 0xffffffff }),
  ])

  const byDeck = new Map<string, ExportedCard[]>()
  for (const doc of res.docs as unknown as FlashCard[]) {
    const list = byDeck.get(doc.deckId)
    if (list) list.push(toExportedCard(doc))
    else byDeck.set(doc.deckId, [toExportedCard(doc)])
  }

  return {
    format: COLLECTION_FORMAT,
    version: COLLECTION_VERSION,
    exportedAt: new Date().toISOString(),
    decks: decks.map(d => ({
      name: d.name,
      description: d.description,
      cards: byDeck.get(d._id) ?? [],
    })),
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function toCardSide(v: unknown): CardSide | null {
  if (!isRecord(v) || typeof v.content !== 'string') return null
  return { content: v.content }
}

// Returns null when the scheduling state is unusable, which the caller turns
// into a fresh card rather than a failed import — a card without its history
// is still worth having. Fields ts-fsrs added after this file was written
// (or deprecated out of it) fall back to createEmptyCard()'s defaults so a
// file from a different ts-fsrs version still round-trips.
function toFSRSCard(v: unknown): FSRSCard | null {
  if (!isRecord(v)) return null
  for (const k of ['stability', 'difficulty', 'reps', 'lapses', 'state'] as const) {
    if (typeof v[k] !== 'number' || !Number.isFinite(v[k] as number)) return null
  }
  const due = toDate(v.due)
  if (!due) return null
  const base = createEmptyCard()
  const lastReview = toDate(v.last_review)
  return {
    ...base,
    due,
    stability: v.stability as number,
    difficulty: v.difficulty as number,
    elapsed_days: num(v.elapsed_days, base.elapsed_days),
    scheduled_days: num(v.scheduled_days, base.scheduled_days),
    learning_steps: num(v.learning_steps, base.learning_steps),
    reps: v.reps as number,
    lapses: v.lapses as number,
    state: v.state as FSRSCard['state'],
    ...(lastReview ? { last_review: lastReview } : {}),
  }
}

// A card with no readable front is dropped rather than failing the file —
// one bad row shouldn't cost you the other four hundred.
function parseExportedCards(raw: unknown): ExportedCard[] {
  if (!Array.isArray(raw)) return []
  const cards: ExportedCard[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) continue
    const front = toCardSide(entry.front)
    if (!front) continue
    const backs = Array.isArray(entry.backs)
      ? entry.backs.map(toCardSide).filter((b): b is CardSide => b !== null)
      : []
    const now = new Date().toISOString()
    cards.push({
      front,
      backs,
      fsrs: toFSRSCard(entry.fsrs),
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : now,
      updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : now,
    })
  }
  return cards
}

// Throws with a message suitable for showing the user — the file is picked by
// hand, so "not a cardflashs deck file" beats a TypeError from deep in a map.
export function parseDeckExport(text: string): DeckExport {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (isRecord(raw) && raw.format === COLLECTION_FORMAT) {
    throw new Error('That file is a full collection export, not a single deck.')
  }
  if (!isRecord(raw) || raw.format !== EXPORT_FORMAT) {
    throw new Error('That file is not a Cardflashs deck export.')
  }
  if (num(raw.version, 0) > EXPORT_VERSION) {
    throw new Error('That file was written by a newer version of Cardflashs.')
  }
  if (!Array.isArray(raw.cards)) {
    throw new Error('That deck file has no cards in it.')
  }
  const deck = isRecord(raw.deck) ? raw.deck : {}
  const cards = parseExportedCards(raw.cards)
  return {
    format: EXPORT_FORMAT,
    version: num(raw.version, EXPORT_VERSION),
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    deck: {
      name: typeof deck.name === 'string' ? deck.name : '',
      description: typeof deck.description === 'string' ? deck.description : '',
    },
    cards,
  }
}

// An import runs well inside one millisecond, so Date.now() alone doesn't
// separate the ids. The counter keeps them distinct across every deck in a
// single collection import; the random suffix covers other tabs.
let importSeq = 0
function newCardId(): string {
  return `card_${Date.now()}_${importSeq++}_${Math.random().toString(36).slice(2, 8)}`
}

async function insertCards(deckId: string, cards: ExportedCard[]): Promise<ImportResult> {
  if (cards.length === 0) return { imported: 0, skipped: 0, progressReset: 0 }
  let progressReset = 0
  const docs: FlashCard[] = cards.map((c): FlashCard => {
    const fsrs: FSRSCard = c.fsrs ?? createEmptyCard()
    if (!c.fsrs) progressReset++
    return {
      _id: newCardId(),
      type: 'card',
      deckId,
      front: c.front,
      backs: c.backs,
      fsrs,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }
  })
  const res = await getLocalDB().bulkDocs(docs)
  const failed = res.filter(r => 'error' in r && r.error).length
  return { imported: docs.length - failed, skipped: failed, progressReset }
}

// Cards are appended under fresh ids, so importing the same file twice gives
// you two copies rather than clobbering anything already in the deck.
export async function importCards(deckId: string, data: DeckExport): Promise<ImportResult> {
  return insertCards(deckId, data.cards)
}

// mergeByName appends into an existing deck whose name matches exactly;
// otherwise every deck in the file is created fresh. Nothing already in the
// database is ever modified or removed either way.
export async function importCollection(
  data: CollectionExport,
  { mergeByName }: { mergeByName: boolean },
): Promise<CollectionImportResult> {
  const byName = new Map<string, string>()
  if (mergeByName) {
    for (const d of await getAllDecks()) if (!byName.has(d.name)) byName.set(d.name, d._id)
  }

  const total: CollectionImportResult = {
    decksCreated: 0, decksMerged: 0, imported: 0, skipped: 0, progressReset: 0,
  }

  for (const entry of data.decks) {
    const name = entry.name || 'Imported deck'
    let deckId = byName.get(name)
    if (deckId) {
      total.decksMerged++
    } else {
      const created = await createDeck(name, entry.description)
      deckId = created._id
      total.decksCreated++
      // Two decks sharing a name inside one file land together rather than
      // producing a duplicate on the second pass.
      byName.set(name, deckId)
    }
    const res = await insertCards(deckId, entry.cards)
    total.imported += res.imported
    total.skipped += res.skipped
    total.progressReset += res.progressReset
  }

  return total
}

export function parseCollectionExport(text: string): CollectionExport {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (isRecord(raw) && raw.format === EXPORT_FORMAT) {
    throw new Error("That file is a single deck — import it from that deck's page.")
  }
  if (!isRecord(raw) || raw.format !== COLLECTION_FORMAT) {
    throw new Error('That file is not a Cardflashs collection export.')
  }
  if (num(raw.version, 0) > COLLECTION_VERSION) {
    throw new Error('That file was written by a newer version of Cardflashs.')
  }
  if (!Array.isArray(raw.decks)) {
    throw new Error('That file has no decks in it.')
  }
  const decks: ExportedDeck[] = []
  for (const entry of raw.decks) {
    if (!isRecord(entry)) continue
    decks.push({
      name: typeof entry.name === 'string' ? entry.name : '',
      description: typeof entry.description === 'string' ? entry.description : '',
      cards: parseExportedCards(entry.cards),
    })
  }
  return {
    format: COLLECTION_FORMAT,
    version: num(raw.version, COLLECTION_VERSION),
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    decks,
  }
}
