# CouchDB setup for cardflashs

cardflashs is a local-first PouchDB app. When the user is signed out it writes
to a per-tab IndexedDB store and never touches the network. When they sign in
with Google, the app starts a continuous, bidirectional sync between that
local store and a per-user CouchDB database.

The flow:

1. Browser does Google Sign-In via Google Identity Services and gets back an
   ID token (a JWT signed by Google with RS256).
2. The app decodes the token to extract the `sub` claim, which is Google's
   stable per-user identifier.
3. PouchDB opens a remote pointing at `http://<couchdb>/userdb-<hex(sub)>` and
   attaches an `Authorization: Bearer <id-token>` header to every request.
4. CouchDB validates the JWT against Google's RSA public keys, maps the `sub`
   claim to a user name, and `couch_peruser` materializes the per-user
   database on first contact. The user is automatically the only member.

Identity verification happens in CouchDB, not in the browser. The browser
never proves the token is valid — it just decodes it for UI purposes.

## Prerequisites

- Docker + Docker Compose (or a regular CouchDB 3.2+ install).
- A Google OAuth 2.0 **client ID** of type "Web application", with
  `http://localhost:5173` (or wherever Vite runs) listed under "Authorized
  JavaScript origins". Create one at
  https://console.cloud.google.com/apis/credentials.
- `bash`, `curl`, `jq`, `openssl`, `python3` on the host running
  `scripts/refresh-jwt-keys.sh`.

## One-time setup

1. Set your client ID and (optionally) the CouchDB URL:
   ```sh
   cp .env.example .env.local
   $EDITOR .env.local   # fill in VITE_GOOGLE_CLIENT_ID
   ```

2. Generate the JWT key file CouchDB will mount:
   ```sh
   ./scripts/refresh-jwt-keys.sh "$VITE_GOOGLE_CLIENT_ID"
   ```
   This writes `couchdb/jwt-keys.ini` with Google's current RS256 keys plus
   the issuer/audience pins.

3. Start CouchDB:
   ```sh
   docker compose -f couchdb/docker-compose.yml up -d
   ```
   First boot bootstraps the admin user (`admin` / `admin` from the compose
   file — change for anything beyond local dev).

4. Confirm it works:
   ```sh
   curl -i http://localhost:5984/
   ```
   You should see CouchDB's banner. The Fauxton UI lives at
   http://localhost:5984/_utils/.

5. Run the app:
   ```sh
   npm run dev
   ```

## Keeping JWT keys fresh

Google rotates its signing keys roughly every 24 hours. Tokens signed with a
key CouchDB hasn't seen will be rejected with `401 invalid_jwt`. In any
non-throwaway environment, schedule the refresh script:

```cron
# Every 4 hours
0 */4 * * * cd /path/to/cardflashs && ./scripts/refresh-jwt-keys.sh $CLIENT_ID >> /var/log/cardflashs-jwt.log 2>&1
```

CouchDB rereads `local.d/*.ini` automatically; you only need to restart the
container if you also edited `local.ini`.

## File map

| Path                              | Purpose                                                |
| --------------------------------- | ------------------------------------------------------ |
| `couchdb/docker-compose.yml`      | Single-node CouchDB container, with config mounted in. |
| `couchdb/local.ini`               | JWT auth, `couch_peruser`, CORS — the durable config.  |
| `couchdb/jwt-keys.ini`            | Generated. Google's RSA public keys + iss/aud pins.    |
| `couchdb/jwt-keys.ini.example`    | Reference for the generated format.                    |
| `scripts/refresh-jwt-keys.sh`     | Pulls Google JWKs and rewrites `jwt-keys.ini`.         |

## Production notes

- Tighten `[cors] origins` in `local.ini` to your real frontend origin.
- Set a strong `COUCHDB_PASSWORD` and rotate it; the admin user is what the
  Fauxton UI and any backups will use.
- Front CouchDB with TLS (a reverse proxy is the usual answer). The browser
  treats anything but `https://` as insecure once you leave localhost.
- Consider enabling `[couch_peruser] delete_dbs = true` only after you have
  user-data backups.
- The `userdb-*` databases hold all flashcard data per user. Standard CouchDB
  replication / continuous backup tooling applies.
