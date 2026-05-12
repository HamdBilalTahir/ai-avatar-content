import { put, list } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename');
  const scriptId = searchParams.get('scriptId');
  const shotId = searchParams.get('shotId');

  if (!filename) {
    return NextResponse.json(
      { error: 'Filename is required' },
      { status: 400 }
    );
  }

  let blobPath: string;

  if (scriptId && shotId) {
    // Count existing versions server-side so the client's stale state can't cause collisions.
    const prefix = `Generated Videos/${scriptId}_${shotId}_`;
    const { blobs } = await list({ prefix });
    const nextVersion = blobs.length + 1;
    blobPath = `${prefix}${nextVersion}.mp4`;
    console.log(
      `[upload] ${blobs.length} existing version(s) → writing ${blobPath}`
    );
  } else {
    blobPath = filename;
  }

  try {
    const blob = await put(blobPath, request.body as ReadableStream, {
      access: 'public',
      allowOverwrite: true,
    });

    return NextResponse.json(blob);
  } catch (error: any) {
    console.error('Error uploading to Vercel Blob:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload file' },
      { status: 500 }
    );
  }
}
