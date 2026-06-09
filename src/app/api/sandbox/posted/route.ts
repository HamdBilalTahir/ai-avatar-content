import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const snap = await db
      .collection('sandbox')
      .where('posted', '==', true)
      .orderBy('postedAt', 'desc')
      .get();

    const sandboxes = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        sandboxId: doc.id,
        topicName: d.topicName ?? '',
        goal: d.goal ?? '',
        finalEditedVideo: d.finalEditedVideo ?? null,
        totalCostUsd: d.totalCostUsd ?? null,
        postedAt: d.postedAt?.toMillis?.() ?? null,
        updatedAt: d.updatedAt?.toMillis?.() ?? null,
        createdAt: d.createdAt?.toMillis?.() ?? null,
      };
    });

    return NextResponse.json({ sandboxes });
  } catch (error: any) {
    console.error('[posted] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
