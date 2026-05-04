import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const getAdminApp = (): App | undefined => {
  try {
    if (getApps().length) {
      return getApps()[0];
    }
    const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (serviceAccountBase64) {
      const serviceAccount = JSON.parse(
        Buffer.from(serviceAccountBase64, 'base64').toString('utf8')
      );
      return initializeApp({ credential: cert(serviceAccount) });
    }

    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    if (clientEmail && privateKey && projectId) {
      return initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
    }
  } catch (error) {
    console.error('Firebase admin initialization error', error);
  }
  return undefined;
};

// Use a proxy so the db is initialized lazily when first accessed,
// rather than at module load time when env vars might not be ready.
export const db = new Proxy(
  {},
  {
    get: (target, prop) => {
      const app = getAdminApp();
      if (!app) return undefined;
      const firestore = getFirestore(app);
      const value = Reflect.get(firestore, prop);
      return typeof value === 'function' ? value.bind(firestore) : value;
    },
  }
) as ReturnType<typeof getFirestore>;
