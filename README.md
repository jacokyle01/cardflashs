# cardflashs

Local-first flashcards with FSRS scheduling. Decks live in IndexedDB via
PouchDB. Sign in with Google to sync them to a CouchDB instance you control —
each Google account gets its own private database, identified by the `sub`
claim of the Google ID token.

## Quick start

```sh
npm install
cp .env.example .env.local   # fill in VITE_GOOGLE_CLIENT_ID
npm run dev
```

Without a `VITE_GOOGLE_CLIENT_ID` the app still works fully offline (the
sign-in button is disabled). Set one and stand up a CouchDB instance to
unlock cross-device sync — see [`couchdb/README.md`](./couchdb/README.md).

## How sync works

- A PouchDB instance always lives in the browser's IndexedDB.
- Signing in fetches a Google ID token (JWT). The app decodes the `sub` claim
  to identify the user.
- A second PouchDB instance pointing at `<COUCHDB_URL>/userdb-<hex(sub)>` is
  opened with the JWT attached as a bearer token on every request.
- A live `db.sync(remote)` runs in both directions until the user signs out
  or the token expires.
- CouchDB validates the JWT against Google's public RSA keys (RS256) and
  uses `couch_peruser` to lazily create the user's database. The token is
  the source of identity end-to-end.

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
