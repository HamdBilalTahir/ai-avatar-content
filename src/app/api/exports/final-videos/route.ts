import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Validate bearer token against apiConfig/exportKeys.finalVideosKey
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return NextResponse.json(
      { error: 'Missing Authorization header' },
      { status: 401 }
    );
  }

  const configSnap = await db.collection('apiConfig').doc('exportKeys').get();
  const expectedKey = configSnap.data()?.finalVideosKey;

  if (!expectedKey || token !== expectedKey) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 403 });
  }

  // Fetch all sandboxes with a finalEditedVideo
  const snap = await db
    .collection('sandbox')
    .where('finalEditedVideo', '!=', null)
    .orderBy('finalEditedVideo')
    .get();

  // For each sandbox, sum totalCostUsd across all run docs in the subcollection
  const videos = await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data();

      const runsSnap = await db
        .collection('sandbox')
        .doc(d.id)
        .collection('generatedVideos')
        .get();

      const videoCostUsd = runsSnap.docs
        .filter((r) => r.id.startsWith('run_'))
        .reduce((sum, r) => sum + (r.data().totalCostUsd ?? 0), 0);

      const imageGenCostUsd = data.imageGenCostUsd ?? 0;
      const scriptGenCostUsd = data.scriptGenCostUsd ?? 0;
      const grandTotalUsd = videoCostUsd + imageGenCostUsd + scriptGenCostUsd;

      return {
        id: d.id,
        topicName: data.topicName ?? null,
        finalEditedVideo: data.finalEditedVideo,
        posted: data.posted ?? false,
        postedAt: data.postedAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
        cost: {
          grandTotalUsd: +grandTotalUsd.toFixed(4),
          videoCostUsd: +videoCostUsd.toFixed(4),
          imageGenCostUsd: +imageGenCostUsd.toFixed(4),
          scriptGenCostUsd: +scriptGenCostUsd.toFixed(4),
        },
      };
    })
  );

  return NextResponse.json({ count: videos.length, videos });
}
