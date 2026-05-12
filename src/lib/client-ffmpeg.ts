import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<boolean> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg?.loaded) return ffmpeg;

  if (!loadPromise) {
    ffmpeg = new FFmpeg();
    loadPromise = ffmpeg.load({
      coreURL: await toBlobURL('/ffmpeg/ffmpeg-core.js', 'text/javascript'),
      wasmURL: await toBlobURL('/ffmpeg/ffmpeg-core.wasm', 'application/wasm'),
    });
  }

  await loadPromise;
  return ffmpeg!;
}

export async function stitchClipsLocally(
  videoUrls: string[],
  onProgress?: (msg: string) => void
): Promise<Blob> {
  onProgress?.('Loading FFmpeg…');
  const ff = await getFFmpeg();

  onProgress?.('Fetching clips…');
  for (let i = 0; i < videoUrls.length; i++) {
    onProgress?.(`Fetching clip ${i + 1} / ${videoUrls.length}`);
    ff.writeFile(`clip${i}.mp4`, await fetchFile(videoUrls[i]));
  }

  const concatList = videoUrls.map((_, i) => `file 'clip${i}.mp4'`).join('\n');
  ff.writeFile('concat.txt', new TextEncoder().encode(concatList));

  onProgress?.('Stitching…');
  await ff.exec([
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    'concat.txt',
    '-fflags',
    '+genpts',
    '-c',
    'copy',
    'output.mp4',
  ]);

  const data = (await ff.readFile('output.mp4')) as Uint8Array;

  // Clean up virtual FS
  for (let i = 0; i < videoUrls.length; i++)
    ff.deleteFile(`clip${i}.mp4`).catch(() => {});
  ff.deleteFile('concat.txt').catch(() => {});
  ff.deleteFile('output.mp4').catch(() => {});

  return new Blob([new Uint8Array(data)], { type: 'video/mp4' });
}

export async function extractAudioLocally(
  videoUrl: string,
  onProgress?: (msg: string) => void
): Promise<Blob> {
  onProgress?.('Loading FFmpeg…');
  const ff = await getFFmpeg();

  onProgress?.('Fetching video…');
  ff.writeFile('input.mp4', await fetchFile(videoUrl));

  onProgress?.('Extracting audio…');
  await ff.exec([
    '-i',
    'input.mp4',
    '-vn',
    '-acodec',
    'libmp3lame',
    '-q:a',
    '2',
    'output.mp3',
  ]);

  const data = (await ff.readFile('output.mp3')) as Uint8Array;

  ff.deleteFile('input.mp4').catch(() => {});
  ff.deleteFile('output.mp3').catch(() => {});

  return new Blob([new Uint8Array(data)], { type: 'audio/mpeg' });
}
