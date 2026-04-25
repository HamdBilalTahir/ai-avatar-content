import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export const maxDuration = 300;

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (
    cronSecret &&
    authHeader !== `Bearer ${cronSecret}` &&
    request.headers.get('x-cron-secret') !== cronSecret
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runId = Date.now().toString();
  await logPipelineStep(
    runId,
    'generate_scripts',
    'started',
    'Script generation process initiated'
  );

  try {
    const ideasRef = db.collection('post_ideas');
    const snapshot = await ideasRef.where('status', '==', 'approved').get();

    if (snapshot.empty) {
      await logPipelineStep(
        runId,
        'generate_scripts',
        'completed',
        'No approved ideas found to generate scripts for.'
      );
      return NextResponse.json({
        success: true,
        message: 'No approved ideas found.',
      });
    }

    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const scriptsRef = db.collection('scripts');
    const batch = db.batch();
    let generatedCount = 0;

    for (const doc of snapshot.docs) {
      const idea = doc.data();

      const promptContext = `
Headline: ${idea.headline}
Hook: ${idea.hook}
Angle: ${idea.angle}
Category: ${idea.category}
Initial Script Outline: ${idea.script}
      `.trim();

      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openAiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            max_tokens: 2000,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content:
                  'You are an expert video producer and copywriter for Dubai real estate investors and buyers. Return only structured JSON.',
              },
              {
                role: 'user',
                content: `Write a shot-by-shot script for a vertical short-form video optimized for Instagram Reels based on the following idea.
The video will be 8 seconds per shot at 1080p. The tone should be confident and authoritative but conversational. 
The audience is Dubai real estate investors and buyers.

Idea Details:
${promptContext}

You must return a JSON object with a single field "shots", which is an array of objects. 
Each shot object must have the following fields:
- "shot_number": an integer
- "words": the exact words the speaker says in this shot
- "visual_direction": a visual direction note describing what should be on screen, camera movement, and what type of reference image would work best.

Example format:
{
  "shots": [
    {
      "shot_number": 1,
      "words": "...",
      "visual_direction": "..."
    }
  ]
}`,
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenAI API error for idea ${doc.id}:`, errorText);
        continue;
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      try {
        const parsed = JSON.parse(content);
        const shots = parsed.shots || [];

        if (shots.length > 0) {
          const newScriptRef = scriptsRef.doc();
          batch.set(newScriptRef, {
            idea_id: doc.id,
            shots: shots,
            status: 'pending_review',
            reference_image_ids: [],
            created_at: new Date().toISOString(),
          });

          // Update idea status to prevent reprocessing
          batch.update(doc.ref, { status: 'script_generated' });
          generatedCount++;
        }
      } catch (parseError) {
        console.error(`Failed to parse script for idea ${doc.id}:`, parseError);
      }
    }

    if (generatedCount > 0) {
      await batch.commit();

      // Send Telegram notification
      await sendTelegramNotification(generatedCount);
    }

    await logPipelineStep(
      runId,
      'generate_scripts',
      'completed',
      `Successfully generated ${generatedCount} scripts.`
    );

    return NextResponse.json({
      success: true,
      scripts_generated: generatedCount,
    });
  } catch (error: any) {
    console.error('Error generating scripts:', error);
    await logPipelineStep(
      runId,
      'generate_scripts',
      'failed',
      error.message || 'Unknown error'
    );
    return NextResponse.json(
      { error: 'Failed to generate scripts' },
      { status: 500 }
    );
  }
}

async function sendTelegramNotification(count: number) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.warn(
      'Telegram bot token or chat ID not configured, skipping notification.'
    );
    return;
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || 'https://ai-avatar-content.vercel.app';
  const message = `🎬 *${count} New Scripts Generated!*\n\nReview them in the dashboard:\n${appUrl}/script`;

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
        }),
      }
    );

    if (!response.ok) {
      console.error('Failed to send Telegram message:', await response.text());
    }
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
  }
}

async function logPipelineStep(
  runId: string,
  stepName: string,
  status: string,
  message: string
) {
  try {
    await db.collection('pipeline_logs').add({
      runId,
      stepName,
      status,
      message,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error logging pipeline step:', err);
  }
}
