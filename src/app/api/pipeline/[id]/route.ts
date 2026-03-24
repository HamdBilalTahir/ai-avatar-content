import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/jobs';
import type { PipelineStatusResponse } from '@/lib/types';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const job = await getJob(id);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const video_url =
      job.status === 'complete' && job.final_video_path !== null
        ? `/api/storage/${id}/video`
        : null;

    const response: PipelineStatusResponse = { job, video_url };
    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
