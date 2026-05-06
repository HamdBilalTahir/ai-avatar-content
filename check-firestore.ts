import * as admin from 'firebase-admin';
import * as fs from 'fs';

const serviceAccount = JSON.parse(
  fs.readFileSync(
    '/Users/hamdbilaltahir/Downloads/ai-video-content-pipeline-firebase-adminsdk-fbsvc-604113c942.json',
    'utf8'
  )
);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function check() {
  const docRef = db.collection('intelligence').doc('filmDirectionSystem');
  const collections = await docRef.listCollections();
  console.log(
    'Subcollections of filmDirectionSystem:',
    collections.map((c) => c.id)
  );

  if (collections.find((c) => c.id === 'styles')) {
    const styles = await docRef.collection('styles').get();
    console.log('styles count:', styles.docs.length);
    styles.docs.forEach((d) => {
      console.log('- style doc:', d.id, Object.keys(d.data()));
    });
  }
}

check().catch(console.error);
