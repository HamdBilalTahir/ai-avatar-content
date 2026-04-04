import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';

export async function generateReel({
  prompt,
  outputName,
  modelName = 'veo-3.1-fast-generate-preview',
  duration = 8,
  resolution = '720p',
  imagePath = null,
  apiKey,
}: {
  prompt: string;
  outputName: string;
  modelName?: string;
  duration?: number;
  resolution?: string;
  imagePath?: string | null;
  apiKey?: string;
}) {
  const ai = new GoogleGenAI({ apiKey: apiKey || process.env.GOOGLE_API_KEY });

  console.log(`\n==================================================`);
  console.log(`🎥 Preparing to generate: ${outputName}`);
  console.log(`==================================================`);
  console.log(`📦 Generation Config:`);
  console.log(`  - Model: ${modelName}`);
  console.log(`  - Duration: ${duration}s`);
  console.log(`  - Resolution: ${resolution}`);
  console.log(`  - Prompt: ${prompt.substring(0, 50)}...`);
  if (imagePath) console.log(`  - Image Path: ${imagePath}`);
  console.log(`==================================================\n`);

  try {
    // 1. Prepare Reference Images
    const referenceImages = [];
    if (imagePath) {
      console.log(`📸 Loading reference image: ${imagePath}`);
      const data = await fs.readFile(imagePath);
      referenceImages.push({
        image: {
          imageBytes: data.toString('base64'),
          mimeType: 'image/png',
        },
        referenceType: 'REFERENCE_TYPE_UNSPECIFIED' as any, // Cast to avoid strict type error if SDK definition is weird, 'asset' isn't explicitly valid based on the error.
      });
    }

    // 2. Start Video Generation
    let operation = await ai.models.generateVideos({
      model: modelName,
      prompt: prompt,
      config: {
        aspectRatio: '9:16',
        durationSeconds: duration,
        resolution: resolution as any,
        ...(referenceImages.length > 0 ? { referenceImages } : {}),
      },
    });

    // 3. Poll for completion
    while (!operation.done) {
      console.log('Waiting for video generation to complete...');
      await new Promise((resolve) => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({
        operation: operation,
      });
    }

    // 4. Save the Output
    if (operation.response?.generatedVideos?.[0]?.video) {
      const dir = path.dirname(outputName);
      try {
        await fs.access(dir);
      } catch {
        await fs.mkdir(dir, { recursive: true });
      }

      await ai.files.download({
        file: operation.response.generatedVideos[0].video,
        downloadPath: outputName,
      });
      console.log(`✅ SUCCESS — saved to ${outputName}`);
      return outputName;
    } else {
      throw new Error('No video returned in the final response.');
    }
  } catch (error: any) {
    console.error(`❌ Video generation failed:`, error.message);
    throw error;
  }
}
