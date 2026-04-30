import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let app: App | undefined;

try {
  if (getApps().length) {
    app = getApps()[0];
  } else {
    const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (serviceAccountBase64) {
      const serviceAccount = JSON.parse(
        Buffer.from(serviceAccountBase64, 'base64').toString('utf8')
      );
      app = initializeApp({ credential: cert(serviceAccount) });
    }
    // No fallback initializeApp() — without credentials it would fail at query time anyway
  }
} catch (error) {
  console.error('Firebase admin initialization error', error);
}

export const db = app
  ? getFirestore(app)
  : (null as unknown as ReturnType<typeof getFirestore>);
