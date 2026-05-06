import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import * as dotenv from 'dotenv';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Load .env if present
dotenv.config();

if (getApps().length === 0) {
  const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (serviceAccountBase64) {
    const serviceAccount = JSON.parse(
      Buffer.from(serviceAccountBase64, 'base64').toString('utf8')
    );
    initializeApp({ credential: cert(serviceAccount) });
  } else {
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    if (clientEmail && privateKey && projectId) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
    } else {
      console.error(
        'Missing Firebase credentials in environment variables (FIREBASE_SERVICE_ACCOUNT_BASE64 or FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY/NEXT_PUBLIC_FIREBASE_PROJECT_ID).'
      );
      process.exit(1);
    }
  }
}

const db = getFirestore();

async function run() {
  console.log('Fetching film direction system from Firestore...');
  const docRef = db.collection('intelligence').doc('filmDirectionSystem');

  // Fetch commonRules from the subcollection
  const commonRulesDoc = await docRef
    .collection('commonRules')
    .doc('commonRules')
    .get();

  let commonRules = '';
  if (commonRulesDoc.exists) {
    commonRules = commonRulesDoc.data()?.commonRules || '';
  }

  const stylesSnapshot = await docRef.collection('styles').get();
  const styles = stylesSnapshot.docs.map((d) => ({
    key: d.id,
    rules: d.data().rules || '',
  }));

  const availableKeys = styles.map((s) => s.key);

  console.log(
    `Found common rules (${commonRules.length} chars) and ${styles.length} styles.`
  );
  console.log(`Available Keys: ${availableKeys.join(', ')}`);

  const flashLlm = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash',
    apiKey: process.env.GEMINI_API_KEY,
  });

  // Simulated Selection Context
  const selectionContext = {
    goalText:
      'Create a fast-paced UGC style reel showing off a new modern luxury villa in Dubai with an energetic tone',
    aspectRatio: '9:16',
    hasHumanSubject: true,
    isUGC: true,
  };

  const existingDialogues = [
    'Check out this amazing villa',
    "It's right in the heart of Dubai",
    'Luxury living at its finest',
  ];

  // Note: we'll simulate without an image here to keep the test simple,
  // but we demonstrate passing the dialogues just like the API.
  const avatarImageBase64: string | null = process.env.AVATAR_B64 || null;

  console.log('\nRunning simulated pre-selection for context...');
  console.log('Context:', JSON.stringify(selectionContext, null, 2));

  const preSelectionSchema = z.object({
    selectedKey: z
      .string()
      .describe('The single best matching style key from the available list'),
  });

  const preSelectionPrompt = `You are a cinematic director deciding the best visual style for a video.
Based on the goal, existing dialogues (if any), and the provided reference image (if any), pick the SINGLE most appropriate style key from the available list.
Do not invent keys. Output only one key that exactly matches one of the available keys.

Context:
Goal Text: ${selectionContext.goalText}
Aspect Ratio: ${selectionContext.aspectRatio}
Has Human Subject: ${selectionContext.hasHumanSubject}
Is UGC Style: ${selectionContext.isUGC}
Existing Dialogues: ${existingDialogues ? JSON.stringify(existingDialogues) : 'None'}

Available Style Keys:
${availableKeys.join(', ')}`;

  const messages: any[] = [];
  if (avatarImageBase64) {
    const imageUrl = avatarImageBase64.startsWith('data:')
      ? avatarImageBase64
      : `data:image/jpeg;base64,${avatarImageBase64}`;

    messages.push(
      new HumanMessage({
        content: [
          { type: 'text', text: preSelectionPrompt },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      })
    );
  } else {
    messages.push({ role: 'user', content: preSelectionPrompt });
  }

  console.log('\nQuerying Gemini 2.5 Flash for the best style key...');
  const parsedPreSelection = await flashLlm
    .withStructuredOutput(preSelectionSchema)
    .invoke(messages);

  const selectedKey = parsedPreSelection.selectedKey;
  const selectedStyle = styles.find(
    (s: any) => s.key.toLowerCase() === selectedKey.toLowerCase()
  );

  let assembledSystem = '';

  console.log('\n--- SELECTION RESULT ---');
  if (selectedStyle) {
    console.log(`Successfully matched style key: ${selectedKey}`);
    assembledSystem = `Common Rules:\n${commonRules || ''}\n\nSelected Style (${selectedKey}):\n${selectedStyle.rules}`;
  } else {
    console.warn(`Pre-selection returned unknown key: ${selectedKey}`);
    assembledSystem = `Common Rules:\n${commonRules || ''}`;
  }

  console.log(`Assembled text length: ${assembledSystem.length} characters`);

  const outPath = path.join(process.cwd(), 'simulated_output.txt');
  fs.writeFileSync(outPath, assembledSystem);
  console.log(`\nWrote the final assembled filmDirectionSystem to: ${outPath}`);
}

run().catch(console.error);
