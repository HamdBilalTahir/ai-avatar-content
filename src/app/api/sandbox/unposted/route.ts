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
      .where('posted', '!=', true)
      .get();

    const sandboxes = snap.docs
      .map((doc) => {
        const d = doc.data();
        if (!d.finalEditedVideo) return null;
        return {
          sandboxId: doc.id,
          topicName: d.topicName ?? '',
          goal: d.goal ?? '',
          finalEditedVideo: d.finalEditedVideo,
          totalCostUsd: d.totalCostUsd ?? null,
          updatedAt: d.updatedAt?.toMillis?.() ?? null,
          createdAt: d.createdAt?.toMillis?.() ?? null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ sandboxes });
  } catch (error: any) {
    console.error('[unposted] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
