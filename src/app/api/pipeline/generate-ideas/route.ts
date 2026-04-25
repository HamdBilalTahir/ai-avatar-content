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

  const isCronRequest =
    !!cronSecret &&
    (authHeader === `Bearer ${cronSecret}` ||
      request.headers.get('x-cron-secret') === cronSecret);

  const runId = Date.now().toString();
  await logPipelineStep(
    runId,
    'generate_ideas',
    'started',
    'Idea generation process initiated'
  );

  try {
    const articlesRef = db.collection('scraped_articles');
    const snapshot = await articlesRef
      .where('used', '==', false)
      .orderBy('scraped_at', 'desc')
      .limit(10)
      .get();

    if (snapshot.empty) {
      await logPipelineStep(
        runId,
        'generate_ideas',
        'completed',
        'No new articles found to generate ideas from.'
      );
      return NextResponse.json({
        success: true,
        message: 'No unused articles found.',
      });
    }

    const articles: any[] = [];
    const articleIds: string[] = [];

    snapshot.forEach((doc) => {
      articles.push(doc.data());
      articleIds.push(doc.id);
    });

    const promptContext = articles
      .map(
        (a) =>
          `Headline: ${a.headline}\nSummary: ${a.summary}\nCategory: ${a.category}`
      )
      .join('\n\n');

    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: `Act as a Dubai real estate content strategist. Based on the following recent news articles, generate exactly 3 post ideas for Instagram.
For each idea return:
- a catchy headline
- a one-line hook
- a suggested content angle
- a short 4 to 5 shot script outline
- the category (e.g. Off-plan, Rental, Luxury, Market Trends, General)

Return the response as a JSON array of objects. Do not include any other text outside the JSON array.
Here are the articles:
${promptContext}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Attempt to extract JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from Claude response');
    }

    const ideas = JSON.parse(jsonMatch[0]);

    const batch = db.batch();
    const ideasRef = db.collection('post_ideas');

    for (const idea of ideas) {
      const newDocRef = ideasRef.doc();
      batch.set(newDocRef, {
        headline: idea.headline || idea.catchy_headline || '',
        hook: idea.hook || idea.one_line_hook || '',
        angle: idea.angle || idea.suggested_content_angle || '',
        script: idea.script || idea.script_outline || '',
        category: idea.category || 'General',
        status: 'pending_approval',
        source_article_ids: articleIds,
        created_at: new Date().toISOString(),
      });
    }

    for (const id of articleIds) {
      const articleDocRef = articlesRef.doc(id);
      batch.update(articleDocRef, { used: true });
    }

    await batch.commit();

    await logPipelineStep(
      runId,
      'generate_ideas',
      'completed',
      `Successfully generated ${ideas.length} ideas and updated source articles.`
    );

    if (isCronRequest) {
      fetch(new URL('/api/telegram/notify', request.url).toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cronSecret}`,
        },
      }).catch((e) =>
        console.error('Error triggering Telegram notification:', e)
      );
    }

    return NextResponse.json({ success: true, ideas_generated: ideas.length });
  } catch (error: any) {
    console.error('Error generating ideas:', error);
    await logPipelineStep(
      runId,
      'generate_ideas',
      'failed',
      error.message || 'Unknown error'
    );
    return NextResponse.json(
      { error: 'Failed to generate ideas' },
      { status: 500 }
    );
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
