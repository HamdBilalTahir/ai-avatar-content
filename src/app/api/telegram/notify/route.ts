import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export const maxDuration = 60;

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

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return NextResponse.json(
      { error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured' },
      { status: 500 }
    );
  }

  const runId = Date.now().toString();
  await logPipelineStep(
    runId,
    'telegram_notify',
    'started',
    'Telegram notification process initiated'
  );

  try {
    const ideasSnap = await db
      .collection('post_ideas')
      .where('status', '==', 'pending_approval')
      .orderBy('created_at', 'desc')
      .limit(3)
      .get();

    if (ideasSnap.empty) {
      await logPipelineStep(
        runId,
        'telegram_notify',
        'completed',
        'No pending ideas found — skipping Telegram notification'
      );
      return NextResponse.json({
        success: true,
        message: 'No pending ideas to notify about.',
      });
    }

    const ideas: {
      id: string;
      headline: string;
      hook: string;
      category: string;
    }[] = [];
    ideasSnap.forEach((doc) => {
      const d = doc.data();
      ideas.push({
        id: doc.id,
        headline: d.headline || '',
        hook: d.hook || '',
        category: d.category || 'General',
      });
    });

    const ideaLines = ideas
      .map(
        (idea, i) =>
          `*Idea ${i + 1}*\n` +
          `📌 *Headline:* ${escapeMarkdown(idea.headline)}\n` +
          `🎣 *Hook:* ${escapeMarkdown(idea.hook)}\n` +
          `🏷 *Category:* ${escapeMarkdown(idea.category)}`
      )
      .join('\n\n');

    const message =
      `🚀 *New Post Ideas — Approval Needed*\n\n` +
      `${ideaLines}\n\n` +
      `---\n` +
      `✅ Reply with the idea numbers you want to approve \\(e\\.g\\. *1, 3*\\) or type *approve all* to approve everything\\.`;

    const telegramRes = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'MarkdownV2',
        }),
      }
    );

    if (!telegramRes.ok) {
      const errText = await telegramRes.text();
      throw new Error(`Telegram API error: ${telegramRes.status} ${errText}`);
    }

    const telegramData = await telegramRes.json();
    const messageId: number = telegramData.result.message_id;

    await db.collection('telegram_messages').add({
      message_id: messageId,
      idea_ids: ideas.map((i) => i.id),
      type: 'idea_approval',
      sent_at: new Date().toISOString(),
    });

    await logPipelineStep(
      runId,
      'telegram_notify',
      'completed',
      `Sent Telegram notification with message_id ${messageId} for ${ideas.length} ideas`
    );

    return NextResponse.json({
      success: true,
      message_id: messageId,
      ideas_count: ideas.length,
    });
  } catch (error: any) {
    console.error('Error sending Telegram notification:', error);
    await logPipelineStep(
      runId,
      'telegram_notify',
      'failed',
      error.message || 'Unknown error'
    );
    return NextResponse.json(
      { error: 'Failed to send Telegram notification' },
      { status: 500 }
    );
  }
}

// Escapes special characters required by Telegram MarkdownV2
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
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
