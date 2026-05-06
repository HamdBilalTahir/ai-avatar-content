import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { put } from '@vercel/blob';

function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
    proc.on('error', (err) =>
      reject(
        new Error(
          `FFmpeg not found: ${err.message}. Install ffmpeg on your server.`
        )
      )
    );
  });
}

export async function POST(req: NextRequest) {
  let body: { videoUrls: string[]; filename?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { videoUrls, filename = `stitched_${Date.now()}.mp4` } = body;

  if (!videoUrls || !Array.isArray(videoUrls) || videoUrls.length === 0) {
    return NextResponse.json(
      { error: 'No videoUrls provided' },
      { status: 400 }
    );
  }

  if (videoUrls.length === 1) {
    return NextResponse.json({ videoUrl: videoUrls[0] }, { status: 200 });
  }

  const outDir = path.join(process.cwd(), 'storage', 'sandbox', 'stitch');
  await mkdir(outDir, { recursive: true });

  const tmpFiles: string[] = [];
  const concatListPath = path.join(outDir, `concat_${Date.now()}.txt`);
  const outputPath = path.join(outDir, `output_${Date.now()}.mp4`);
  tmpFiles.push(concatListPath);

  try {
    const processedPaths: string[] = [];

    // Download each video to tmp
    for (let i = 0; i < videoUrls.length; i++) {
      const url = videoUrls[i];
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to download video at index ${i}: ${url}`);
      }

      const buffer = await res.arrayBuffer();
      const tempVideoPath = path.join(outDir, `part_${Date.now()}_${i}.mp4`);
      await writeFile(tempVideoPath, Buffer.from(buffer));
      processedPaths.push(tempVideoPath);
      tmpFiles.push(tempVideoPath);
    }

    const concatContent = processedPaths.map((p) => `file '${p}'`).join('\n');
    await writeFile(concatListPath, concatContent);

    // Concatenate videos
    await runFFmpeg([
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatListPath,
      '-c',
      'copy',
      outputPath,
    ]);

    tmpFiles.push(outputPath);

    const fileStream = createReadStream(outputPath);
    // Upload to Vercel blob
    const blob = await put(`sandbox/${filename}`, fileStream, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return NextResponse.json({ videoUrl: `${blob.url}?t=${Date.now()}` });
  } catch (err: any) {
    console.error('Stitching error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to stitch videos' },
      { status: 500 }
    );
  } finally {
    for (const f of tmpFiles) {
      if (existsSync(f)) unlink(f).catch(() => {});
    }
  }
}
