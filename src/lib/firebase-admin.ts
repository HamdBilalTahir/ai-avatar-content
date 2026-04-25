import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

if (!serviceAccountBase64) {
  console.warn(
    'FIREBASE_SERVICE_ACCOUNT_BASE64 is missing, Firebase Admin will not initialize properly.'
  );
}

let app: ReturnType<typeof initializeApp> | undefined;

try {
  if (!getApps().length) {
    if (serviceAccountBase64) {
      const serviceAccount = JSON.parse(
        Buffer.from(serviceAccountBase64, 'base64').toString('utf8')
      );
      app = initializeApp({
        credential: cert(serviceAccount),
      });
    } else {
      app = initializeApp();
    }
  } else {
    app = getApps()[0];
  }
} catch (error) {
  console.error('Firebase admin initialization error', error);
}

export const db = getFirestore(app || initializeApp());
