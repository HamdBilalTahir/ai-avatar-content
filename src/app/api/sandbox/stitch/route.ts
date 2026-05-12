import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile, unlink, readFile } from 'fs/promises';
import { existsSync } from 'fs';
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
  let body: {
    videoUrls: string[];
    filename?: string;
    extractAudio?: boolean;
    stream?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    videoUrls,
    filename = `stitched_${Date.now()}.mp4`,
    extractAudio = false,
    stream = false,
  } = body;

  if (!videoUrls || !Array.isArray(videoUrls) || videoUrls.length === 0) {
    return NextResponse.json(
      { error: 'No videoUrls provided' },
      { status: 400 }
    );
  }

  const outDir = path.join(process.cwd(), 'storage', 'sandbox', 'stitch');
  await mkdir(outDir, { recursive: true });

  const ts = Date.now();
  const concatListPath = path.join(outDir, `concat_${ts}.txt`);
  const outputPath = path.join(
    outDir,
    `output_${ts}.${extractAudio ? 'mp3' : 'mp4'}`
  );
  const tmpFiles = [concatListPath, outputPath];

  const tag = `[Stitch ${ts}]`;
  console.log(
    `${tag} START — ${videoUrls.length} clip(s), extractAudio=${extractAudio}, stream=${stream}`
  );
  videoUrls.forEach((u, i) => console.log(`${tag}   clip[${i}]: ${u}`));

  try {
    // Point FFmpeg directly at the remote URLs — no Node.js download step needed
    const concatContent = videoUrls.map((u) => `file '${u}'`).join('\n');
    await writeFile(concatListPath, concatContent);

    console.log(
      `${tag} Running FFmpeg (${extractAudio ? 'audio extract' : 'video concat'})…`
    );
    const ffmpegStart = Date.now();

    if (extractAudio) {
      await runFFmpeg([
        '-y',
        '-protocol_whitelist',
        'file,http,https,tcp,tls',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        concatListPath,
        '-vn',
        '-acodec',
        'libmp3lame',
        '-q:a',
        '2',
        outputPath,
      ]);
    } else {
      await runFFmpeg([
        '-y',
        '-protocol_whitelist',
        'file,http,https,tcp,tls',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        concatListPath,
        '-fflags',
        '+genpts',
        '-c',
        'copy',
        outputPath,
      ]);
    }

    console.log(
      `${tag} FFmpeg done in ${((Date.now() - ffmpegStart) / 1000).toFixed(1)}s → ${outputPath}`
    );

    if (stream) {
      console.log(
        `${tag} Streaming output directly to client (no Blob upload)`
      );
      const buffer = await readFile(outputPath);
      console.log(
        `${tag} DONE — streamed ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB`
      );
      const contentType = extractAudio ? 'audio/mpeg' : 'video/mp4';
      const ext = extractAudio ? 'mp3' : 'mp4';
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename.replace(/\.[^/.]+$/, '')}.${ext}"`,
          'Content-Length': String(buffer.byteLength),
        },
      });
    }

    // Default: upload to Vercel Blob and return the URL (needed for the player)
    console.log(`${tag} Uploading to Vercel Blob…`);
    const uploadStart = Date.now();
    const fileBuffer = await readFile(outputPath);
    const targetFilename = extractAudio
      ? filename.replace(/\.[^/.]+$/, '') + '.mp3'
      : filename;
    const blob = await put(`sandbox/${targetFilename}`, fileBuffer, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    console.log(
      `${tag} Blob upload done in ${((Date.now() - uploadStart) / 1000).toFixed(1)}s → ${blob.url}`
    );
    console.log(`${tag} DONE`);

    return NextResponse.json({
      [extractAudio ? 'audioUrl' : 'videoUrl']: `${blob.url}?t=${Date.now()}`,
    });
  } catch (err: any) {
    console.error(`${tag} ERROR:`, err.message);
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
