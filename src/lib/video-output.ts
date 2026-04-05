import path from 'path';

const TMP_DIR = '/tmp/generated';

export function resolveOutputPath(shotNumber: number | undefined): {
  outputPath: string;
  outputFilename: string;
  videoUrl: string;
} {
  const timestamp = Date.now();
  const outputFilename = shotNumber
    ? `shot_${shotNumber}_${timestamp}.mp4`
    : `shot_${timestamp}.mp4`;

  const outputPath = path.join(TMP_DIR, outputFilename);

  return {
    outputPath,
    outputFilename,
    videoUrl: `/api/generated/${outputFilename}`,
  };
}
