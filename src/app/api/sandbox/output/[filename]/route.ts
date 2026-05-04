import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, existsSync } from 'fs';
import { stat } from 'fs/promises';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    const cleanFilename = path.basename(filename);
    const filePath = path.join('/tmp/generated', cleanFilename);

    if (!existsSync(filePath)) {
      return new NextResponse('Video not found', { status: 404 });
    }

    const fileStat = await stat(filePath);
    const stream = createReadStream(filePath);

    // Convert Node.js readable stream to Web API readable stream
    const readableStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: any) =>
          controller.enqueue(new Uint8Array(chunk))
        );
        stream.on('end', () => controller.close());
        stream.on('error', (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    return new NextResponse(readableStream, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': fileStat.size.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error serving output video:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
