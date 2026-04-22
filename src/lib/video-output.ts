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
    ? version === 1
      ? `shot_${shotNumber}.mp4`
      : `shot_${shotNumber}_(v${version}).mp4`
    : `shot_unknown_(v${version}).mp4`;

  const outputPath = path.join(TMP_DIR, outputFilename);

  return {
    outputPath,
    outputFilename,
    videoUrl: `/api/generated/${outputFilename}`,
  };
}
