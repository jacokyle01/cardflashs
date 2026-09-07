# Agent scripts

`cf.mjs` lets an AI agent (or you, from a shell) read and write your
flashcards through CouchDB's HTTP API using a long-lived agent token. It
never touches Firebase or the app's token functions.

## Setup

1. In the app: **Settings → Agent access → Create token.** Name it after the
   agent (e.g. `claude-code`). Copy the **token** and the **database URL** it
   shows — they are displayed once.
2. Put both in `.env.local` at the repo root (already gitignored; the script
   reads it by default):

   ```
   CARDFLASHS_DB=http://localhost:5984/userdb-<hex>
   CARDFLASHS_TOKEN=eyJ...
   ```

   Alternatives: export them as environment variables, or keep them in a
   file elsewhere and pass `--env /path/to/file`. Never commit the token.
   Mint a separate token per CouchDB (local vs production): a token is only
   valid for the server that issued it.
3. Check it: `node scripts/cf.mjs whoami`

## Commands

```
node scripts/cf.mjs decks
node scripts/cf.mjs cards <deckId>
node scripts/cf.mjs add-deck "Spanish" "Vocab from class"
node scripts/cf.mjs add-card <deckId> "hola" "hello"
node scripts/cf.mjs import <deckId> cards.tsv      # or .json
node scripts/cf.mjs get <docId>
node scripts/cf.mjs delete <docId>                 # a deck deletes its cards too
```

Add `--json` to any command for machine-readable output.

Import formats:

- JSON: `[{"front":"hola","backs":["hello"]}, {"front":"adiós","back":"goodbye"}]`
- TSV: one card per line, `front<TAB>back[<TAB>back2 ...]`, `#` lines ignored

New cards get a fresh FSRS state, so they show up as new cards in the app.
The browser's live sync pulls changes in within a few seconds.

## Revoking

Settings → Agent access → trash icon. The token stops working immediately;
the script then reports "CouchDB rejected the token".
