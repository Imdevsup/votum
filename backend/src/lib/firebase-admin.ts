// Firebase Admin SDK initialisation. Used to verify Firebase ID tokens
// returned by the client after a GitHub OAuth sign-in via Firebase Auth.
//
// Credential resolution:
//   1. FIREBASE_SERVICE_ACCOUNT_JSON env var (the JSON content as a string)
//   2. GOOGLE_APPLICATION_CREDENTIALS env var pointing at a JSON file
//   3. (none) — projectId-only init. ID-token verification only needs to
//      fetch Google's public JWKS, which doesn't require a credential.
//      We skip applicationDefault() in this case because on a non-GCP host
//      it tries to hit metadata.google.internal and fails with ENOTFOUND.
import admin from 'firebase-admin';
import { env } from '../env.js';

let initialised = false;
let initError: Error | null = null;

function init() {
  if (initialised) return;
  try {
    if (admin.apps.length === 0) {
      const config: admin.AppOptions = { projectId: env.FIREBASE_PROJECT_ID };
      if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
        config.credential = admin.credential.cert(sa);
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        config.credential = admin.credential.applicationDefault();
      }
      admin.initializeApp(config);
    }
    initialised = true;
  } catch (err) {
    initError = err as Error;
    throw err;
  }
}

export interface DecodedFirebaseIdToken {
  uid: string;
  email?: string;
  email_verified?: boolean;
  firebase: {
    identities: Record<string, unknown>;
    sign_in_provider: string;
  };
}

export async function verifyIdToken(idToken: string): Promise<DecodedFirebaseIdToken> {
  init();
  if (initError) throw initError;
  // checkRevoked=false so we don't need an admin credential — the call
  // becomes a pure JWKS-based signature + audience check.
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded as unknown as DecodedFirebaseIdToken;
}

export function firebaseConfigured(): boolean {
  return Boolean(
    env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS,
  );
}
