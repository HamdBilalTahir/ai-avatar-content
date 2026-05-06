import path from 'path';

const TMP_DIR = '/tmp/generated';

export function resolveOutputPath(
  shotNumber: number | undefined,
  existingCount: number = 0
): {
  outputPath: string;
  outputFilename: string;
  videoUrl: string;
} {
  const version = existingCount + 1;
  const outputFilename = shotNumber
    ? `shot_${shotNumber}_${version}.mp4`
    : `shot_unknown_${version}.mp4`;

  const outputPath = path.join(TMP_DIR, outputFilename);

  return {
    outputPath,
    outputFilename,
    videoUrl: `/api/generated/${outputFilename}`,
  };
}
