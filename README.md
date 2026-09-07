# cardflashs

Local-first flashcards with FSRS scheduling. Decks live in IndexedDB via
PouchDB. Sign in with Google or an email and password (through Firebase
Auth) to sync them to a CouchDB instance you control — each user gets their
own private database, and only that user (or an agent token they issued)
can read or write it. Google and password sign-ins with the same email are
the same user.

## Quick start

```sh
npm install
cp .env.example .env.local        # Firebase web config + CouchDB URL
cp .dev.vars.example .dev.vars    # server-side secrets for the token functions
docker compose -f couchdb/docker-compose.yml up -d
npm run functions                 # token-exchange API on :8788
npm run dev                       # app on :5173, proxies /api to :8788
```

Without the `VITE_FIREBASE_*` variables the app still works fully offline
(the sign-in button is disabled).

### Firebase setup

1. Create a Firebase project and a Web app in it. Copy `apiKey`,
   `authDomain` and `projectId` into `.env.local`.
2. Authentication → Sign-in method → enable **Google** and
   **Email/Password**. Keep the default "one account per email address".
3. Authentication → Settings → Authorized domains: add every origin you
   serve the app from (`localhost` is pre-authorized).
4. Put the same project id in `.dev.vars` as `FIREBASE_PROJECT_ID`.

Firebase is used for identity only. It never sees your cards.

## How auth and sync work

There are three parties: the browser, CouchDB, and a small set of
Cloudflare Pages Functions in [`functions/`](./functions) that act as the
token service. The browser talks to CouchDB directly; the functions are only
involved when a token is minted.

```
browser ──(Firebase ID token)──▶ /api/token ──(admin creds)──▶ CouchDB
   │                                  │  creates userdb-<hex(uid)>,
   │                                  │  sets _security, mints a JWT
   │◀──── CouchDB JWT (1h) ───────────┘
   │
   └──(Bearer JWT)──▶ CouchDB /userdb-<hex(uid)>   ← PouchDB live sync
```

- **Identity.** The browser signs in via Firebase Auth, with Google or an
  email and password. The Firebase ID token (a Google-signed RS256 JWT, 1h)
  proves who the user is; the provider doesn't matter downstream.
- **Exchange.** `POST /api/token` verifies that ID token against Google's
  published keys (`jose` handles key rotation), provisions the user's
  database if needed, and returns a CouchDB JWT signed with an HMAC key the
  functions share with CouchDB (`[jwt_keys] hmac:app`). The browser refreshes
  it five minutes before expiry and caches it so a reload can resume sync
  without waiting on the function.
- **Sync.** PouchDB syncs the local IndexedDB database with
  `<VITE_COUCHDB_URL>/userdb-<hex(uid)>`, sending the CouchDB JWT as a
  bearer token on every request. No CouchDB credentials ever reach the
  browser.
- **Authorization** is enforced entirely by CouchDB:
  - `require_valid_user = true`: anonymous requests are rejected.
  - Each `userdb-*` has `_security.members.names = [uid]`, so a token whose
    `sub` is another user gets 403. Non-admins cannot list databases.
  - The role `owner:<uid>` is the database's admin role. Browser tokens
    carry it (so PouchDB can replicate design docs and Mango indexes);
    agent tokens do not, so an agent can read and write documents but cannot
    alter `_security` or design documents.
  - CouchDB's admin credentials are held only by the functions.

## Agent access

Settings → **Agent access** creates long-lived tokens for AI agents and
scripts. Each token is a CouchDB JWT for your user, signed with its own HMAC
key that the function registers in CouchDB's config under
`[jwt_keys] hmac:agent-<id>`. The token is shown once. Revoking it deletes
that key, which invalidates the token immediately regardless of its expiry.
Token metadata (name, dates — never the token itself) is stored in your own
database as `agenttoken:*` documents.

An agent needs only the database URL and the token. The whole API is
CouchDB's HTTP API:

```sh
export DB="https://db.example.com/userdb-<hex>"   # shown when the token is created
export TOKEN="eyJ..."

# list everything
curl -H "Authorization: Bearer $TOKEN" "$DB/_all_docs?include_docs=true"

# decks / cards via Mango
curl -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"selector":{"type":"deck"}}' "$DB/_find"
curl -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"selector":{"type":"card","deckId":"deck:..."}}' "$DB/_find"

# create / update a document (include _rev to update)
curl -X PUT -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"type":"deck","name":"Spanish"}' "$DB/deck:<id>"
```

For anything beyond one-off reads, use [`scripts/cf.mjs`](./scripts/README.md):
it lists decks, adds and bulk-imports cards, and initialises new cards'
FSRS state the way the app does. A Claude Code skill in
`.claude/skills/cardflashs/` teaches the agent to use it. Document shapes
are in [`src/lib/types.ts`](./src/lib/types.ts). Changes an agent makes
replicate to the browser the next time it syncs. Agent tokens
cannot mint further tokens: the token endpoints accept Firebase ID tokens
only.

## Deployment

- **App + functions**: Cloudflare Pages with build command `npm run build`
  and output directory `dist`. The `functions/` directory deploys
  automatically as Pages Functions at `/api/*`. Set the `VITE_*` variables
  from `.env.example` and the variables from `.dev.vars.example` in the
  project's environment variables (mark the CouchDB password and JWT secret
  as secrets). Step-by-step instructions are in [`SETUP.md`](./SETUP.md).
- **CouchDB**: apply the settings in [`couchdb/local.ini`](./couchdb/local.ini)
  with a fresh `hmac:app` secret (`openssl rand -base64 32`, the same value
  as `COUCHDB_JWT_SECRET`), real admin credentials, and CORS `origins` set
  to the app's origin. The last ini file CouchDB loads must be writable —
  that is where it persists the agent keys registered at runtime (the
  docker-compose setup keeps a `99-runtime.ini` for this). The
  `/_node/_local/_config` API is per node, so this design assumes a
  single-node CouchDB.

## React + TypeScript + Vite template notes

This project was bootstrapped from a minimal Vite + React + TS template.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
