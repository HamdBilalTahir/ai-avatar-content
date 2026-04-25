import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { db } from '@/lib/firebase-admin';

export const maxDuration = 300;

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Off-plan': ['off-plan', 'off plan', 'launch', 'new project'],
  Rental: ['rental', 'rent', 'lease', 'tenant'],
  Luxury: ['luxury', 'villa', 'mansion', 'penthouse', 'premium', 'exclusive'],
  'Market Trends': [
    'transaction',
    'dld',
    'sales',
    'growth',
    'market',
    'surge',
    'record',
  ],
  Commercial: ['commercial', 'office', 'retail', 'industrial'],
};

function classifyCategory(text: string): string {
  const lowerText = text.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        return category;
      }
    }
  }
  return 'General';
}

const SOURCES = [
  {
    name: 'Khaleej Times',
    url: 'https://www.khaleejtimes.com/business/real-estate',
    parse: ($: cheerio.CheerioAPI) => {
      const articles: any[] = [];
      $('.story-card').each((_, el) => {
        const headline = $(el)
          .find('h2.story-title, h3.story-title, .title')
          .text()
          .trim();
        const urlPath = $(el).find('a').attr('href');
        const url = urlPath
          ? urlPath.startsWith('http')
            ? urlPath
            : `https://www.khaleejtimes.com${urlPath}`
          : '';
        const summary = $(el)
          .find('.story-summary, .description')
          .text()
          .trim();
        if (headline && url) {
          articles.push({ headline, url, summary });
        }
      });
      return articles;
    },
  },
  {
    name: 'Gulf News',
    url: 'https://gulfnews.com/business/property',
    parse: ($: cheerio.CheerioAPI) => {
      const articles: any[] = [];
      $('.card').each((_, el) => {
        const headline = $(el)
          .find('h2.title, h3.title, .card-title')
          .text()
          .trim();
        const urlPath = $(el).find('a').attr('href');
        const url = urlPath
          ? urlPath.startsWith('http')
            ? urlPath
            : `https://gulfnews.com${urlPath}`
          : '';
        const summary = $(el).find('.summary, .card-lead').text().trim();
        if (headline && url) {
          articles.push({ headline, url, summary });
        }
      });
      return articles;
    },
  },
];

export async function GET(request: Request) {
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
    'scrape_news',
    'started',
    'Scraping process initiated'
  );

  let totalScraped = 0;
  const articlesToSave: any[] = [];

  for (const source of SOURCES) {
    try {
      const res = await fetch(source.url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (!res.ok) {
        console.error(`Failed to fetch ${source.name}: ${res.statusText}`);
        continue;
      }

      const html = await res.text();
      const $ = cheerio.load(html);

      const parsedArticles = source.parse($);

      for (const article of parsedArticles) {
        const category = classifyCategory(
          `${article.headline} ${article.summary}`
        );
        articlesToSave.push({
          headline: article.headline,
          summary: article.summary,
          url: article.url,
          source: source.name,
          category,
          scraped_at: new Date().toISOString(),
          used: false,
        });
      }
    } catch (err) {
      console.error(`Error scraping ${source.name}:`, err);
    }
  }

  const batch = db.batch();
  const articlesRef = db.collection('scraped_articles');

  for (const article of articlesToSave) {
    const docRef = articlesRef.doc(
      Buffer.from(article.url).toString('base64').replace(/[/+=]/g, '_')
    );
    batch.set(docRef, article, { merge: true });
    totalScraped++;
  }

  if (totalScraped > 0) {
    await batch.commit();
  }

  await logPipelineStep(
    runId,
    'scrape_news',
    'completed',
    `Successfully scraped ${totalScraped} articles`
  );

  if (isCronRequest) {
    fetch(new URL('/api/pipeline/generate-ideas', request.url).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret}`,
      },
    }).catch((e) => console.error('Error triggering idea generation:', e));
  }

  return NextResponse.json({
    success: true,
    count: totalScraped,
    articles: articlesToSave,
  });
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
