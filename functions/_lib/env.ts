// Environment bindings for the Pages Functions. Set these in the Cloudflare
// Pages project settings (production) or in `.dev.vars` (local dev).
export interface Env {
  // Firebase project id — used as the expected `aud`/`iss` of ID tokens.
  FIREBASE_PROJECT_ID: string
  // CouchDB base URL as reachable from the function (no trailing slash).
  COUCHDB_URL: string
  // CouchDB server-admin credentials. Only the functions ever hold these.
  COUCHDB_ADMIN_USER: string
  COUCHDB_ADMIN_PASSWORD: string
  // Base64-encoded HMAC secret. Must equal `[jwt_keys] hmac:app` in CouchDB.
  COUCHDB_JWT_SECRET: string
}

export function requireEnv(env: Env): Env {
  const missing = (
    ['FIREBASE_PROJECT_ID', 'COUCHDB_URL', 'COUCHDB_ADMIN_USER', 'COUCHDB_ADMIN_PASSWORD', 'COUCHDB_JWT_SECRET'] as const
  ).filter((k) => !env[k])
  if (missing.length) throw new HttpError(500, `Server misconfigured: missing ${missing.join(', ')}`)
  return env
}

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
