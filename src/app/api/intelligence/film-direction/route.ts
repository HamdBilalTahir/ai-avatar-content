import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

// Module-level cache
let cachedData: {
  commonRules: string;
  styles: { key: string; rules: string }[];
} | null = null;
let lastFetchTime = 0;

export async function GET() {
  try {
    if (!db || !db.collection) {
      console.warn(
        'Firestore not initialized. Skipping film direction system fetch.'
      );
      return NextResponse.json(
        { commonRules: null, styles: null },
        { status: 200 }
      );
    }

    // Check cache (valid for 1 hour)
    if (cachedData && Date.now() - lastFetchTime < 3600 * 1000) {
      console.log('Returning film direction data from module-level cache.');
      return NextResponse.json(cachedData, {
        status: 200,
        headers: { 'Cache-Control': 'public, max-age=3600' },
      });
    }

    const docRef = db.collection('intelligence').doc('filmDirectionSystem');

    const commonRulesDoc = await docRef
      .collection('commonRules')
      .doc('commonRules')
      .get();

    const commonRules = commonRulesDoc.exists
      ? commonRulesDoc.data()?.commonRules || null
      : null;

    const stylesSnapshot = await docRef.collection('styles').get();
    const styles = stylesSnapshot.docs.map((d) => ({
      key: d.id,
      rules: d.data().rules || '',
    }));

    cachedData = { commonRules, styles };
    lastFetchTime = Date.now();

    return NextResponse.json(cachedData, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error fetching/parsing film direction system:', error);
    return NextResponse.json(
      { commonRules: null, styles: null },
      { status: 200 }
    );
  }
}
