import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!db || !(db as any).collection) {
    console.error(
      '[exports/mark-posted] Firebase Admin not initialized — check FIREBASE_* env vars on Vercel'
    );
    return NextResponse.json(
      { error: 'Server misconfiguration: Firestore not available' },
      { status: 500 }
    );
  }

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

  let sandboxId: string | undefined;
  try {
    const body = await req.json();
    sandboxId = body.sandboxId;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!sandboxId || typeof sandboxId !== 'string') {
    return NextResponse.json(
      { error: 'sandboxId is required' },
      { status: 400 }
    );
  }

  const sandboxRef = db.collection('sandbox').doc(sandboxId);
  const snap = await sandboxRef.get();

  if (!snap.exists) {
    return NextResponse.json({ error: 'Sandbox not found' }, { status: 404 });
  }

  await sandboxRef.set(
    { posted: true, postedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  return NextResponse.json({ success: true, sandboxId, posted: true });
}
