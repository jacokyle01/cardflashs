# Setup

End-to-end setup for cardflashs with Firebase sign-in, per-user CouchDB
authorization, and agent tokens. Read [README.md](./README.md) first for how
the pieces fit together.

## 1. Firebase project (identity)

1. Go to https://console.firebase.google.com and **Add project**. Google
   Analytics can be off.
2. **Build → Authentication → Get started → Sign-in method.** Enable two
   providers:
   - **Google**: pick a support email and save. Firebase creates the Google
     OAuth client for you; the old `VITE_GOOGLE_CLIENT_ID` client is no
     longer used and can be deleted from Google Cloud later.
   - **Email/Password**: enable (leave "Email link" off).

   Under **Sign-in method → Advanced**, keep the default *Prevent creation of
   multiple accounts with the same email address*. That setting is what makes
   a password account and a Google account with the same email resolve to
   one user, and therefore one database.
3. **Authentication → Settings → Authorized domains.** `localhost` is
   already there. Add every domain you will serve the app from, e.g.
   `cardflashs.com` and `cardflashs.pages.dev`. No wildcards.
4. **Project settings (gear) → General → Your apps → Add app → Web (`</>`).**
   Register it (no hosting needed). Copy `apiKey`, `authDomain` and
   `projectId` from the config it shows.

You now have the three `VITE_FIREBASE_*` values and the `FIREBASE_PROJECT_ID`.

## 2. Local development

### CouchDB

```sh
cp couchdb/local.example.ini couchdb/local.ini
chmod 666 couchdb/local.ini      # CouchDB writes back into it (see below)
docker compose -f couchdb/docker-compose.yml up -d
curl -u admin:admin http://localhost:5984/_node/_local/_config/jwt_keys
# -> {"hmac:app":"ZGV2..."}   (the dev signing key from local.ini)
```

`local.ini` is the entire CouchDB configuration: JWT auth,
`require_valid_user`, CORS, admin credentials, and the signing key. It is
gitignored because it holds secrets and because CouchDB writes into it —
the admin password is replaced with its hash on first boot, and agent-token
keys are appended under `[jwt_keys]` as you create them. The dev defaults
work as-is.

### Environment files

```sh
cp .env.example .env.local
cp .dev.vars.example .dev.vars
```

`.env.local` (browser, safe to expose):

| Variable                    | Value                             |
| --------------------------- | --------------------------------- |
| `VITE_FIREBASE_API_KEY`     | from step 1.4                     |
| `VITE_FIREBASE_AUTH_DOMAIN` | `<project>.firebaseapp.com`       |
| `VITE_FIREBASE_PROJECT_ID`  | `<project>`                       |
| `VITE_COUCHDB_URL`          | `http://localhost:5984`           |
| `VITE_API_URL`              | leave empty (Vite proxies `/api`) |

`.dev.vars` (token functions, never shipped to the browser):

| Variable                 | Value                                              |
| ------------------------ | -------------------------------------------------- |
| `FIREBASE_PROJECT_ID`    | `<project>` (same as above)                        |
| `COUCHDB_URL`            | `http://localhost:5984`                            |
| `COUCHDB_ADMIN_USER`     | `admin`                                            |
| `COUCHDB_ADMIN_PASSWORD` | `admin`                                            |
| `COUCHDB_JWT_SECRET`     | keep the dev value; it matches `couchdb/local.ini` |

### Run

Two terminals:

```sh
npm run functions   # wrangler serves functions/ at http://localhost:8788
npm run dev         # Vite on http://localhost:5173, proxies /api -> :8788
```

The first `wrangler` run may ask about telemetry; no Cloudflare login is
needed for local dev.

### Check it works

1. Open http://localhost:5173 and click **Sign in**. Use Google or create
   an email/password account.
2. The cloud icon in the header should settle on "Synced". Hovering it shows
   any error (for example "CouchDB rejected the session token").
3. Fauxton at http://localhost:5984/_utils (admin/admin) should show a
   `userdb-<hex>` database with `_security` listing your uid.
4. Settings → **Agent access** → create a token. The curl example it shows
   should return your documents.

If sign-in fails with `auth/unauthorized-domain`, add the origin in step 1.3.
If it fails with `auth/popup-blocked`, allow popups for the site.

## 3. Production

### Secrets

Generate one signing secret and keep it for both CouchDB and the functions:

```sh
openssl rand -base64 32
```

### CouchDB

On the server, in a checkout of this repo:

```sh
cp couchdb/local.example.ini couchdb/local.ini
chmod 666 couchdb/local.ini
$EDITOR couchdb/local.ini
```

Change the three values marked `PROD` in the file:

| Section      | Key        | Value                                                    |
|--------------|------------|----------------------------------------------------------|
| `[admins]`   | `admin`    | a strong password (CouchDB hashes it on first boot)      |
| `[jwt_keys]` | `hmac:app` | the base64 secret from above (= `COUCHDB_JWT_SECRET`)    |
| `[cors]`     | `origins`  | `https://cardflashs.com` (comma-separate several)        |

Then start or recreate the container. `down` keeps the `couchdb-data`
volume, so existing databases survive:

```sh
docker compose -f couchdb/docker-compose.yml down
docker compose -f couchdb/docker-compose.yml up -d
```

Verify:

```sh
C=https://db.example.com; A=admin:REAL_PASSWORD
curl -s $C/_session              # "authentication_handlers":["jwt","cookie","default"]
curl -s -o /dev/null -w '%{http_code}\n' $C/        # 401: anonymous is locked out
curl -s -u "$A" $C/_node/_local/_config/jwt_keys      # lists hmac:app
grep -n '^admin' couchdb/local.ini                    # now a -pbkdf2- hash
```

If the last line still shows the plaintext password, CouchDB could not
write the file: fix the permissions (`chmod 666`) and restart, because
agent-token keys are persisted the same way and would otherwise be lost on
restart.

Later changes: edit `local.ini` and restart the container. To rotate the
admin password, replace the hash with the new plaintext; CouchDB re-hashes
it. Update `COUCHDB_ADMIN_PASSWORD` in Cloudflare at the same time.

Existing `userdb-*` databases from the Google-`sub` era will not match the
new Firebase uids; delete them when you are done migrating.

### Cloudflare Pages

1. Workers & Pages → the cardflashs project (or **Create → Pages → Connect
   to Git**). Build command `npm run build`, output directory `dist`. The
   `functions/` directory is picked up automatically.
2. **Settings → Environment variables**, for Production (and Preview if you
   use it). Plain text:
   - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`
   - `VITE_COUCHDB_URL` = `https://db.example.com` (no trailing slash or space)
   - `FIREBASE_PROJECT_ID`
   - `COUCHDB_URL` = `https://db.example.com`
   - `COUCHDB_ADMIN_USER`

   Encrypt (secret):
   - `COUCHDB_ADMIN_PASSWORD`
   - `COUCHDB_JWT_SECRET` = the base64 secret from above

   Remove the old `VITE_GOOGLE_CLIENT_ID`, `VITE_COUCHDB_USERNAME` and
   `VITE_COUCHDB_PASSWORD`.

3. **Settings → Functions → Compatibility date**: set a recent date
   (the dev script uses 2026-09-01).
4. Commit and push. Pages builds the app and deploys the functions at
   `https://<your-domain>/api/*`.
5. Add the Pages domain(s) to Firebase authorized domains (step 1.3).

### Check production

```sh
curl -i https://db.example.com/            # 401: anonymous is locked out
curl -i -X POST https://cardflashs.com/api/token   # 401 "Missing Firebase ID token"
```

Then sign in on the deployed app and confirm the sync icon settles, and
create an agent token from Settings.

## 4. Using an agent token

When you create a token, the app shows the token, the database URL and a
curl example. An agent needs only those two values:

```sh
export DB="https://db.example.com/userdb-<hex>"
export TOKEN="eyJ..."
curl -H "Authorization: Bearer $TOKEN" "$DB/_all_docs?include_docs=true"
```

- The token grants access to that one database and nothing else. It cannot
  create tokens, list databases, or change `_security`.
- Revoke it from Settings → Agent access. Revocation is immediate.
- Rotating the `hmac:app` secret invalidates browser sessions (they refresh
  transparently) but not agent tokens, which have their own keys.
