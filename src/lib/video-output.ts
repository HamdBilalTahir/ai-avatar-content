import path from 'path';
import fs from 'fs';

const TMP_DIR = '/tmp/generated';

export function resolveOutputPath(shotNumber: number | undefined): {
  outputPath: string;
  outputFilename: string;
  videoUrl: string;
} {
  let outputFilename = shotNumber
    ? `shot_${shotNumber}.mp4`
    : `shot_${Date.now()}.mp4`;

  let outputPath = path.join(TMP_DIR, outputFilename);

  if (shotNumber) {
    let counter = 1;
    while (fs.existsSync(outputPath)) {
      outputFilename = `shot_${shotNumber}_(${counter}).mp4`;
      outputPath = path.join(TMP_DIR, outputFilename);
      counter++;
    }
  }

  return {
    outputPath,
    outputFilename,
    videoUrl: `/api/generated/${outputFilename}`,
  };
}
