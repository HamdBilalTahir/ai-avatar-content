import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const itemId = formData.get('itemId') as string | null;
  const projectId = formData.get('projectId') as string | null;

  if (!file || !itemId || !projectId) {
    return NextResponse.json(
      { error: 'file, itemId, and projectId are required' },
      { status: 400 }
    );
  }

  const dir = path.join(process.cwd(), 'storage', 'video-maker', projectId);
  await mkdir(dir, { recursive: true });

  const ext =
    path.extname(file.name) ||
    (file.type.startsWith('video/') ? '.mp4' : '.mp3');
  const filename = `${itemId}${ext}`;
  const filepath = path.join(dir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  const serverPath = path.join('storage', 'video-maker', projectId, filename);

  return NextResponse.json({ serverPath }, { status: 200 });
}
