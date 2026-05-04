import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (!db || !db.collection) {
      console.warn(
        'Firestore not initialized. Skipping film direction system fetch.'
      );
      return NextResponse.json({ content: null }, { status: 200 });
    }

    const doc = await db
      .collection('intelligence')
      .doc('filmDirectionSystem')
      .get();

    if (!doc.exists) {
      console.log('Film direction system document was not found.');
      return NextResponse.json(
        { content: null },
        {
          status: 200,
          headers: {
            'Cache-Control': 'public, max-age=3600',
          },
        }
      );
    }

    const data = doc.data();
    console.log('Fetched film direction system data:', Object.keys(data || {}));

    const content = data?.filmDirectionSystem || null;

    if (!content) {
      console.log(
        'Film direction system content field was not found in document data.'
      );
    }

    return NextResponse.json(
      { content },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=3600',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching film direction system:', error);
    return NextResponse.json({ content: null }, { status: 200 });
  }
}
