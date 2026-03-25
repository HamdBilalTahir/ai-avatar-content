import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';

interface ExportClip {
  id: string;
  mediaItemId: string;
  trackId: string;
  timelineStart: number;
  trimStart: number;
  trimEnd: number;
  speed: number;
  volume: number; // 0–100
  serverPath: string | null;
  mediaDuration: number;
}

interface ExportTrack {
  id: string;
  type: 'video' | 'audio';
  name: string;
  muted: boolean;
}

interface ExportManifest {
  projectId: string;
  tracks: ExportTrack[];
  clips: ExportClip[];
}

/**
 * Build atempo filter chain. atempo accepts 0.5–2.0 so chain for edge values.
 * Only returns a non-empty string when speed != 1.
 */
function atempoChain(speed: number): string {
  if (speed === 1) return '';
  // Chain two atempo filters when speed < 0.5 (min is 0.25 = 0.5*0.5)
  if (speed <= 0.5) return `atempo=${speed * 2},atempo=0.5`;
  return `atempo=${speed}`;
}

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
  let manifest: ExportManifest;
  try {
    manifest = (await req.json()) as ExportManifest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { projectId, tracks, clips } = manifest;

  const missing = clips.filter((c) => !c.serverPath);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `${missing.length} clip(s) not yet uploaded to server` },
      { status: 422 }
    );
  }

  const outDir = path.join(process.cwd(), 'storage', 'video-maker', projectId);
  await mkdir(outDir, { recursive: true });

  const sortedClips = [...clips].sort(
    (a, b) => a.timelineStart - b.timelineStart
  );

  const videoClips = sortedClips.filter((c) => {
    const track = tracks.find((t) => t.id === c.trackId);
    return track?.type === 'video' && !track.muted;
  });

  const audioClips = sortedClips.filter((c) => {
    const track = tracks.find((t) => t.id === c.trackId);
    return track?.type === 'audio' && !track.muted;
  });

  if (videoClips.length === 0 && audioClips.length === 0) {
    return NextResponse.json({ error: 'No clips to export' }, { status: 422 });
  }

  const tmpFiles: string[] = [];
  const concatListPath = path.join(outDir, `concat_${Date.now()}.txt`);
  const outputPath = path.join(outDir, `export_${Date.now()}.mp4`);
  tmpFiles.push(concatListPath);

  try {
    if (videoClips.length > 0) {
      const processedPaths: string[] = [];

      for (const clip of videoClips) {
        const src = path.join(process.cwd(), clip.serverPath!);
        if (!existsSync(src)) continue;

        const trimmedDuration =
          clip.mediaDuration - clip.trimStart - clip.trimEnd;
        const effectiveDuration = trimmedDuration / clip.speed;
        const outClip = path.join(outDir, `clip_${clip.id}.mp4`);
        tmpFiles.push(outClip);

        const vol = (clip.volume / 100).toFixed(4);
        const audioFilters =
          [atempoChain(clip.speed), `volume=${vol}`]
            .filter(Boolean)
            .join(',') || 'anull';

        // Always re-encode video to ensure a keyframe at the start of every
        // clip — copying the stream can leave the first frame without its
        // reference frames, which video players render as black.
        const args = [
          '-y',
          '-ss',
          String(clip.trimStart),
          '-t',
          String(trimmedDuration),
          '-i',
          src,
          '-filter_complex',
          `[0:v]setpts=${1 / clip.speed}*PTS[v];[0:a]${audioFilters}[a]`,
          '-map',
          '[v]',
          '-map',
          '[a]',
          '-t',
          String(effectiveDuration),
          '-c:v',
          'libx264',
          '-crf',
          '18',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          outClip,
        ];

        await runFFmpeg(args);
        processedPaths.push(outClip);
      }

      if (processedPaths.length === 0) {
        return NextResponse.json(
          { error: 'No valid video files found on server' },
          { status: 422 }
        );
      }

      const concatContent = processedPaths.map((p) => `file '${p}'`).join('\n');
      await writeFile(concatListPath, concatContent);

      if (audioClips.length === 0) {
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
      } else {
        const concatOut = path.join(outDir, `concat_${Date.now()}.mp4`);
        tmpFiles.push(concatOut);

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
          concatOut,
        ]);

        const audioInputArgs: string[] = [];
        const filterParts: string[] = [];
        let audioIdx = 1;

        for (const clip of audioClips) {
          const src = path.join(process.cwd(), clip.serverPath!);
          if (!existsSync(src)) continue;

          const trimmedDur = clip.mediaDuration - clip.trimStart - clip.trimEnd;
          const vol = (clip.volume / 100).toFixed(4);
          const delay = Math.round(clip.timelineStart * 1000);

          const audioFilters = [
            atempoChain(clip.speed),
            `volume=${vol}`,
            `adelay=${delay}|${delay}`,
          ]
            .filter(Boolean)
            .join(',');

          audioInputArgs.push(
            '-ss',
            String(clip.trimStart),
            '-t',
            String(trimmedDur),
            '-i',
            src
          );
          filterParts.push(`[${audioIdx}:a]${audioFilters}[a${audioIdx}]`);
          audioIdx++;
        }

        if (filterParts.length > 0) {
          const mixInputs = Array.from(
            { length: audioIdx - 1 },
            (_, i) => `[a${i + 1}]`
          ).join('');
          const filterComplex = [
            ...filterParts,
            `[0:a]${mixInputs}amix=inputs=${audioIdx}:normalize=0:duration=longest[aout]`,
          ].join(';');

          await runFFmpeg([
            '-y',
            '-i',
            concatOut,
            ...audioInputArgs,
            '-filter_complex',
            filterComplex,
            '-map',
            '0:v',
            '-map',
            '[aout]',
            '-c:v',
            'copy',
            '-c:a',
            'aac',
            outputPath,
          ]);
        } else {
          await runFFmpeg(['-y', '-i', concatOut, '-c', 'copy', outputPath]);
        }
      }
    } else {
      // Audio-only export
      const audioInputArgs: string[] = [];
      const filterParts: string[] = [];
      let idx = 0;

      for (const clip of audioClips) {
        const src = path.join(process.cwd(), clip.serverPath!);
        if (!existsSync(src)) continue;

        const trimmedDur = clip.mediaDuration - clip.trimStart - clip.trimEnd;
        const vol = (clip.volume / 100).toFixed(4);
        const delay = Math.round(clip.timelineStart * 1000);

        const audioFilters = [
          atempoChain(clip.speed),
          `volume=${vol}`,
          `adelay=${delay}|${delay}`,
        ]
          .filter(Boolean)
          .join(',');

        audioInputArgs.push(
          '-ss',
          String(clip.trimStart),
          '-t',
          String(trimmedDur),
          '-i',
          src
        );
        filterParts.push(`[${idx}:a]${audioFilters}[a${idx}]`);
        idx++;
      }

      const mixInputs = Array.from({ length: idx }, (_, i) => `[a${i}]`).join(
        ''
      );
      await runFFmpeg([
        '-y',
        ...audioInputArgs,
        '-filter_complex',
        `${filterParts.join(';')};${mixInputs}amix=inputs=${idx}:normalize=0:duration=longest`,
        '-c:a',
        'aac',
        outputPath,
      ]);
    }

    const { createReadStream } = await import('fs');
    const { Readable } = await import('stream');
    const fileStream = createReadStream(outputPath);
    const webStream = Readable.toWeb(fileStream) as ReadableStream;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="export.mp4"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    for (const f of tmpFiles) {
      if (existsSync(f)) unlink(f).catch(() => {});
    }
  }
}
