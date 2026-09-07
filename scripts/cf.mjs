#!/usr/bin/env node
// cardflashs agent CLI.
//
// Talks straight to the user's CouchDB database with a long-lived agent
// token (Settings → Agent access in the app). Writes documents in exactly
// the shapes the app uses (src/lib/types.ts), including a freshly
// initialised FSRS state for new cards, so the browser picks them up on its
// next sync with no migration.
//
// Configuration (env vars, or a KEY=value file — default .env.local):
//   CARDFLASHS_DB     e.g. http://localhost:5984/userdb-<hex>
//   CARDFLASHS_TOKEN  the agent token
//
// Usage: node scripts/cf.mjs <command> [args] [--json] [--env <file>]
//   decks                            list decks
//   cards <deckId>                   list cards in a deck
//   add-deck <name> [description]    create a deck, prints its id
//   add-card <deckId> <front> <back> [back2 ...]
//   import <deckId> <file>           bulk-add cards from JSON or TSV (see below)
//   get <docId>                      print a document
//   delete <docId>                   delete a document (asks nothing; be sure)
//   whoami                           check the token and database
//
// Import file formats:
//   JSON: [{"front":"hola","backs":["hello"]}, {"front":"...","back":"..."}]
//   TSV : one card per line, front<TAB>back[<TAB>back2...]; # lines ignored

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createEmptyCard } from 'ts-fsrs'

// --- args ---------------------------------------------------------------------

const argv = process.argv.slice(2)
const flags = { json: false, env: '.env.local' }
const args = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--json') flags.json = true
  else if (argv[i] === '--env') flags.env = argv[++i]
  else args.push(argv[i])
}
const [command, ...rest] = args

// --- config -----------------------------------------------------------------------

function loadEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}
const fileEnv = loadEnvFile(resolve(flags.env))
const DB = (process.env.CARDFLASHS_DB ?? fileEnv.CARDFLASHS_DB ?? '').trim().replace(/\/$/, '')
const TOKEN = (process.env.CARDFLASHS_TOKEN ?? fileEnv.CARDFLASHS_TOKEN ?? '').trim()

function die(msg) {
  console.error(`error: ${msg}`)
  process.exit(1)
}
if (!command) usage()
if (!DB || !TOKEN) die(`CARDFLASHS_DB and CARDFLASHS_TOKEN must be set (env or ${flags.env}). See scripts/README.md.`)

// --- http -----------------------------------------------------------------------------

async function couch(method, path, body) {
  const res = await fetch(`${DB}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!res.ok) {
    const reason = data.reason ?? data.error ?? text
    if (res.status === 400 && /jwt|token|kid|exp/i.test(reason)) die(`CouchDB rejected the token (${reason}). It may be revoked or expired.`)
    if (res.status === 401 || res.status === 403) die(`not allowed (${res.status}: ${reason}). Wrong database URL or token?`)
    die(`${method} ${path} -> ${res.status} ${reason}`)
  }
  return data
}

async function find(selector, fields) {
  const docs = []
  let bookmark
  for (;;) {
    const page = await couch('POST', '/_find', { selector, limit: 500, ...(fields ? { fields } : {}), ...(bookmark ? { bookmark } : {}) })
    docs.push(...page.docs)
    if (page.docs.length < 500) break
    bookmark = page.bookmark
  }
  return docs
}

// --- document shapes (keep in sync with src/lib/types.ts + src/lib/db.ts) ------------

const now = () => new Date().toISOString()
const newId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

function makeDeck(name, description = '') {
  const ts = now()
  return { _id: newId('deck'), type: 'deck', name, description, createdAt: ts, updatedAt: ts }
}

function makeCard(deckId, front, backs) {
  if (!front?.trim()) throw new Error('card front is empty')
  if (!backs.length || backs.some((b) => !b?.trim())) throw new Error(`card "${front}" needs at least one non-empty back`)
  const ts = now()
  return {
    _id: newId('card'),
    type: 'card',
    deckId,
    front: { content: front.trim() },
    backs: backs.map((content) => ({ content: content.trim() })),
    fsrs: createEmptyCard(),
    createdAt: ts,
    updatedAt: ts,
  }
}

// --- output -----------------------------------------------------------------------------

function out(data, human) {
  if (flags.json) console.log(JSON.stringify(data, null, 2))
  else console.log(human)
}

const preview = (s, n = 60) => (s.length > n ? s.slice(0, n - 1) + '…' : s).replace(/\s+/g, ' ')

// --- commands ---------------------------------------------------------------------------

async function requireDeck(deckId) {
  const deck = await couch('GET', `/${encodeURIComponent(deckId)}`)
  if (deck.type !== 'deck') die(`${deckId} is not a deck`)
  return deck
}

const commands = {
  async whoami() {
    const info = await couch('GET', '')
    out(info, `ok: ${DB} (${info.doc_count} docs)`)
  },

  async decks() {
    const decks = (await find({ type: 'deck' })).sort((a, b) => a.name.localeCompare(b.name))
    const cards = await find({ type: 'card' }, ['deckId'])
    const counts = {}
    for (const c of cards) counts[c.deckId] = (counts[c.deckId] ?? 0) + 1
    const rows = decks.map((d) => ({ id: d._id, name: d.name, description: d.description, cards: counts[d._id] ?? 0 }))
    out(rows, rows.length ? rows.map((r) => `${r.id}\t${r.cards} cards\t${r.name}${r.description ? ` — ${preview(r.description)}` : ''}`).join('\n') : '(no decks)')
  },

  async cards(deckId) {
    if (!deckId) usage('cards <deckId>')
    await requireDeck(deckId)
    const cards = (await find({ type: 'card', deckId })).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    out(cards, cards.length ? cards.map((c) => `${c._id}\t${preview(c.front.content)}\t→ ${c.backs.map((b) => preview(b.content, 40)).join(' | ')}`).join('\n') : '(no cards)')
  },

  async 'add-deck'(name, description = '') {
    if (!name) usage('add-deck <name> [description]')
    const deck = makeDeck(name, description)
    await couch('PUT', `/${deck._id}`, deck)
    out(deck, deck._id)
  },

  async 'add-card'(deckId, front, ...backs) {
    if (!deckId || !front || !backs.length) usage('add-card <deckId> <front> <back> [back2 ...]')
    await requireDeck(deckId)
    const card = makeCard(deckId, front, backs)
    await couch('PUT', `/${card._id}`, card)
    out(card, card._id)
  },

  async import(deckId, file) {
    if (!deckId || !file) usage('import <deckId> <file>')
    await requireDeck(deckId)
    const text = readFileSync(file, 'utf8')
    let entries
    if (file.endsWith('.json') || text.trimStart().startsWith('[')) {
      entries = JSON.parse(text).map((e) => ({ front: e.front, backs: e.backs ?? (e.back !== undefined ? [e.back] : []) }))
    } else {
      entries = text.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim() && !l.startsWith('#')).map((l) => {
        const [front, ...backs] = l.split('\t')
        return { front, backs }
      })
    }
    if (!entries.length) die('nothing to import')
    const docs = entries.map((e, i) => {
      try { return makeCard(deckId, e.front, e.backs) } catch (err) { die(`entry ${i + 1}: ${err.message}`) }
    })
    const res = await couch('POST', '/_bulk_docs', { docs })
    const failed = res.filter((r) => r.error)
    if (failed.length) die(`${failed.length} of ${docs.length} cards failed: ${JSON.stringify(failed.slice(0, 3))}`)
    out({ imported: docs.length, ids: docs.map((d) => d._id) }, `imported ${docs.length} cards into ${deckId}`)
  },

  async get(id) {
    if (!id) usage('get <docId>')
    const doc = await couch('GET', `/${encodeURIComponent(id)}`)
    console.log(JSON.stringify(doc, null, 2))
  },

  async delete(id) {
    if (!id) usage('delete <docId>')
    const doc = await couch('GET', `/${encodeURIComponent(id)}`)
    if (doc.type === 'deck') {
      const cards = await find({ type: 'card', deckId: id }, ['_id', '_rev'])
      if (cards.length) {
        await couch('POST', '/_bulk_docs', { docs: cards.map((c) => ({ _id: c._id, _rev: c._rev, _deleted: true })) })
      }
      await couch('DELETE', `/${encodeURIComponent(id)}?rev=${doc._rev}`)
      out({ deleted: id, cards: cards.length }, `deleted deck ${id} and ${cards.length} cards`)
      return
    }
    await couch('DELETE', `/${encodeURIComponent(id)}?rev=${doc._rev}`)
    out({ deleted: id }, `deleted ${id}`)
  },
}

function usage(cmd) {
  if (cmd) console.error(`usage: node scripts/cf.mjs ${cmd}`)
  else console.error(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('// ')).map((l) => l.slice(3)).join('\n'))
  process.exit(2)
}

const fn = commands[command]
if (!fn) { console.error(`unknown command: ${command}\n`); usage() }
fn(...rest).catch((err) => die(err.message))
