// Firebase is used for one thing: identity. The browser signs in with Google
// through Firebase Auth, then exchanges the Firebase ID token for a CouchDB
// JWT via /api/token (see functions/). Firebase never sees the flashcards.

import { getApps, initializeApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'

// .trim() on every env read — Cloudflare Pages' env var UI silently keeps
// trailing whitespace.
const env = (k: string): string => ((import.meta.env[k] as string | undefined) ?? '').trim()

const config = {
  apiKey: env('VITE_FIREBASE_API_KEY'),
  authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: env('VITE_FIREBASE_PROJECT_ID'),
}

export function isFirebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.authDomain && config.projectId)
}

let auth: Auth | null = null

export function getFirebaseAuth(): Auth {
  if (!auth) {
    const app = getApps()[0] ?? initializeApp(config)
    auth = getAuth(app)
  }
  return auth
}
