# CouchDB setup for cardflashs

cardflashs is a local-first PouchDB app. Decks always live in IndexedDB.
Signing in with Google attaches a continuous, bidirectional sync between
that local store and a per-user database on CouchDB.

**JWT validation is disabled in this configuration.** Identity comes from
Google sign-in client-side — we use the `sub` claim from the ID token to
namespace each user's remote database (`userdb-<hex(sub)>`) — but the
connection from browser to CouchDB authenticates with the admin credentials
defined in `docker-compose.yml`. This is a development shortcut. Do **not**
deploy this configuration; admin credentials end up in the client bundle.

## Prerequisites

- Docker + Docker Compose (or any standalone CouchDB 3.2+).
- A Google OAuth 2.0 **client ID** of type "Web application" with
  `http://localhost:5173` listed under "Authorized JavaScript origins".
  Create one at https://console.cloud.google.com/apis/credentials.

## One-time setup

```sh
cp .env.example .env.local
$EDITOR .env.local        # fill in VITE_GOOGLE_CLIENT_ID

docker compose -f couchdb/docker-compose.yml up -d
curl -i http://localhost:5984/      # banner = working
```

Fauxton UI: http://localhost:5984/_utils/ (admin / admin).

Run the app:

```sh
npm run dev
```

## File map

| Path                              | Purpose                                                |
| --------------------------------- | ------------------------------------------------------ |
| `couchdb/docker-compose.yml`      | Single-node CouchDB container, with config mounted in. |
| `couchdb/local.ini`               | CORS + auth handlers. JWT sections stripped for dev.   |

## Re-enabling JWT auth later

When you want real verification:

1. Add back `[jwt_auth]`, `[chttpd_auth_jwt]`, and `[jwt_keys]` sections to
   `local.ini`, prepend `jwt_authentication_handler` to
   `chttpd_auth.authentication_handlers`, and turn `couch_peruser` back on.
2. Refresh Google's RS256 public keys into `[jwt_keys]` on a schedule
   (Google rotates them ~daily).
3. Switch `src/lib/sync.ts` back to a `fetch` override that attaches
   `Authorization: Bearer <id-token>` instead of using Basic auth.
4. Drop `VITE_COUCHDB_USERNAME` / `VITE_COUCHDB_PASSWORD` from `.env`.

The previous JWT-aware versions of these files are in git history if you
want to crib from them.

## Production notes

- Tighten `[cors] origins` in `local.ini` to your real frontend origin.
- The admin password in `docker-compose.yml` is `admin`. Change it before
  exposing this to anything beyond your laptop.
- Front CouchDB with TLS (a reverse proxy is the usual answer).
- The `userdb-*` databases hold all flashcard data per user. Standard
  CouchDB replication / continuous backup tooling applies.
