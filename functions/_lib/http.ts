import { HttpError, requireEnv, type Env } from './env'
import { verifyFirebaseIdToken, type FirebaseUser } from './firebase'

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

// Wraps a handler so thrown HttpErrors become JSON error responses and
// anything else becomes a 500 without leaking internals.
export function handle(
  fn: (ctx: { request: Request; env: Env; user: FirebaseUser; params: Record<string, string | string[]> }) => Promise<Response>,
): PagesFunction<Env> {
  return async ({ request, env, params }) => {
    try {
      requireEnv(env)
      const user = await requireFirebaseUser(request, env)
      return await fn({ request, env, user, params })
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status)
      console.error(err)
      return json({ error: 'Internal error' }, 500)
    }
  }
}

// Every route is authenticated with a Firebase ID token in the Authorization
// header. CouchDB JWTs (including agent tokens) are deliberately NOT accepted
// here: an agent must not be able to mint further tokens.
async function requireFirebaseUser(request: Request, env: Env): Promise<FirebaseUser> {
  const header = request.headers.get('authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(header)
  if (!m) throw new HttpError(401, 'Missing Firebase ID token')
  try {
    return await verifyFirebaseIdToken(m[1], env.FIREBASE_PROJECT_ID)
  } catch (err) {
    console.warn('Firebase ID token rejected:', (err as Error).message)
    throw new HttpError(401, 'Invalid Firebase ID token')
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new HttpError(400, 'Body must be JSON')
  }
}
