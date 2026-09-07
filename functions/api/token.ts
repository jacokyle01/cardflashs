// POST /api/token
// Exchange a Firebase ID token for a short-lived CouchDB JWT. Also provisions
// the user's database on first call. The browser calls this on sign-in and
// again shortly before each CouchDB token expires.
import { handle, json } from '../_lib/http'
import { APP_KID, ensureUserDb, ownerRole, signCouchJwt } from '../_lib/couch'

const BROWSER_TOKEN_TTL = 60 * 60 // 1 hour

export const onRequestPost = handle(async ({ env, user }) => {
  const db = await ensureUserDb(env, user.uid)
  const { token, exp } = await signCouchJwt({
    uid: user.uid,
    kid: APP_KID,
    secretB64: env.COUCHDB_JWT_SECRET,
    ttlSeconds: BROWSER_TOKEN_TTL,
    roles: [ownerRole(user.uid)],
  })
  return json({ token, exp, db, uid: user.uid })
})
