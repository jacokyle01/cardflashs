import { createRemoteJWKSet, jwtVerify } from 'jose'

// Google publishes the keys that sign Firebase ID tokens as a JWK set. jose
// caches the set in this isolate and refetches on unknown `kid`, which is how
// key rotation is handled without any config on our side.
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)

export interface FirebaseUser {
  uid: string
  email?: string
}

export async function verifyFirebaseIdToken(idToken: string, projectId: string): Promise<FirebaseUser> {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ['RS256'],
  })
  if (!payload.sub) throw new Error('ID token has no sub')
  return { uid: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined }
}
