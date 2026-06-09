import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sandboxId } = await req.json();
  if (!sandboxId || typeof sandboxId !== 'string') {
    return NextResponse.json(
      { error: 'sandboxId is required' },
      { status: 400 }
    );
  }

  try {
    await db.collection('sandbox').doc(sandboxId).update({
      posted: true,
      postedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ success: true, sandboxId });
  } catch (error: any) {
    console.error('[mark-posted] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
