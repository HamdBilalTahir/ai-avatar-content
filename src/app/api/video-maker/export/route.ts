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
  volume: number;
  pitch: number; // semitones, -12 to +12
  tone: number; // -1 (warm) to +1 (bright)
  serverPath: string | null;
  mediaDuration: number;
}

/**
 * Build the FFmpeg audio filter chain for a clip's pitch + tone adjustments.
 * Pitch uses asetrate+atempo (pitch shift without tempo change).
 * Tone uses two peaking EQ bands (200 Hz warm vs 3 kHz bright).
 */
function audioProcessingFilters(clip: ExportClip): string {
  const filters: string[] = [];

  // Pitch: change sample rate to shift pitch, then time-stretch back to original tempo
  const p = clip.pitch ?? 0;
  if (p !== 0) {
    const factor = Math.pow(2, p / 12);
    const newRate = Math.round(44100 * factor);
    const atempoBack = (1 / factor).toFixed(6);
    filters.push(`asetrate=${newRate}`, `atempo=${atempoBack}`);
  }

  // Tone: simple 2-band peaking EQ (warm = bass up + treble down, bright = opposite)
  const t = clip.tone ?? 0;
  if (Math.abs(t) > 0.01) {
    const bassGain = (-t * 5).toFixed(2);
    const trebleGain = (t * 5).toFixed(2);
    filters.push(
      `equalizer=f=200:width_type=o:width=2:g=${bassGain}`,
      `equalizer=f=3000:width_type=o:width=2:g=${trebleGain}`
    );
  }

  return filters.length > 0 ? ',' + filters.join(',') : '';
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

function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // Try system ffmpeg first; falls back gracefully
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

  // Validate all clips have server paths
  const missing = clips.filter((c) => !c.serverPath);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `${missing.length} clip(s) not yet uploaded to server` },
      { status: 422 }
    );
  }

  const outDir = path.join(process.cwd(), 'storage', 'video-maker', projectId);
  await mkdir(outDir, { recursive: true });

  // Sort clips by timeline start
  const sortedClips = [...clips].sort(
    (a, b) => a.timelineStart - b.timelineStart
  );

  // Build a concat list per track type
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

  // Write a concat file for video clips
  const tmpFiles: string[] = [];
  const concatListPath = path.join(outDir, `concat_${Date.now()}.txt`);
  const outputPath = path.join(outDir, `export_${Date.now()}.mp4`);
  tmpFiles.push(concatListPath);

  try {
    if (videoClips.length > 0) {
      // Process each video clip individually (trim + speed)
      const processedPaths: string[] = [];
      for (const clip of videoClips) {
        const src = path.join(process.cwd(), clip.serverPath!);
        if (!existsSync(src)) continue;

        const effectiveDuration =
          (clip.mediaDuration - clip.trimStart - clip.trimEnd) / clip.speed;
        const outClip = path.join(outDir, `clip_${clip.id}.mp4`);
        tmpFiles.push(outClip);

        const args = [
          '-y',
          '-ss',
          String(clip.trimStart),
          '-t',
          String(clip.mediaDuration - clip.trimStart - clip.trimEnd),
          '-i',
          src,
          '-filter_complex',
          `[0:v]setpts=${1 / clip.speed}*PTS[v];[0:a]volume=${clip.volume},atempo=${clip.speed}${audioProcessingFilters(clip)}[a]`,
          '-map',
          '[v]',
          '-map',
          '[a]',
          '-t',
          String(effectiveDuration),
          '-c:v',
          'libx264',
          '-c:a',
          'aac',
          '-preset',
          'fast',
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

      // Write concat file
      const concatContent = processedPaths.map((p) => `file '${p}'`).join('\n');
      await writeFile(concatListPath, concatContent);

      if (audioClips.length === 0) {
        // Video only
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
        // Concat video, then mix in audio tracks
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

        // Build ffmpeg inputs for audio mixing
        const audioInputs: string[] = [];
        const filterParts: string[] = [];
        let audioIdx = 1;
        for (const clip of audioClips) {
          const src = path.join(process.cwd(), clip.serverPath!);
          if (!existsSync(src)) continue;
          audioInputs.push('-ss', String(clip.trimStart), '-i', src);
          filterParts.push(
            `[${audioIdx}:a]volume=${clip.volume},atempo=${clip.speed}${audioProcessingFilters(clip)},adelay=${Math.round(clip.timelineStart * 1000)}|${Math.round(clip.timelineStart * 1000)}[a${audioIdx}]`
          );
          audioIdx++;
        }

        if (filterParts.length > 0) {
          const mixInputs = Array.from(
            { length: audioIdx - 1 },
            (_, i) => `[a${i + 1}]`
          ).join('');
          const filterComplex = [
            ...filterParts,
            `[0:a]${mixInputs}amix=inputs=${audioIdx}:duration=first[aout]`,
          ].join(';');

          await runFFmpeg([
            '-y',
            '-i',
            concatOut,
            ...audioInputs,
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
      const audioInputs: string[] = [];
      const filterParts: string[] = [];
      let idx = 0;
      for (const clip of audioClips) {
        const src = path.join(process.cwd(), clip.serverPath!);
        if (!existsSync(src)) continue;
        audioInputs.push('-ss', String(clip.trimStart), '-i', src);
        filterParts.push(
          `[${idx}:a]volume=${clip.volume},atempo=${clip.speed}${audioProcessingFilters(clip)},adelay=${Math.round(clip.timelineStart * 1000)}|${Math.round(clip.timelineStart * 1000)}[a${idx}]`
        );
        idx++;
      }
      const mixInputs = Array.from({ length: idx }, (_, i) => `[a${i}]`).join(
        ''
      );
      await runFFmpeg([
        '-y',
        ...audioInputs,
        '-filter_complex',
        `${filterParts.join(';')};${mixInputs}amix=inputs=${idx}:duration=first`,
        '-c:a',
        'aac',
        outputPath,
      ]);
    }

    // Stream file back to client
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
    // Clean up temp clip files (not the output)
    for (const f of tmpFiles) {
      if (existsSync(f)) unlink(f).catch(() => {});
    }
  }
}
