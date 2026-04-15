import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outputDir = path.join(repoRoot, 'public', 'data');
const outputPath = path.join(outputDir, 'corroboration-feed.json');

const FEEDS = [
  { name: 'Reuters World', url: 'https://www.reutersagency.com/feed/?best-topics=world&post_type=best', tier: 1 },
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', tier: 1 },
  { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', tier: 1 },
  { name: 'PBS Headlines', url: 'https://www.pbs.org/newshour/feeds/rss/headlines', tier: 1 },
  { name: 'DW Top Stories', url: 'https://rss.dw.com/rdf/rss-en-top', tier: 2 },
];

function decodeXml(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function stripTags(text) {
  return decodeXml(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTag(item, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = item.match(regex);
  return match ? stripTags(match[1]) : null;
}

function parseRss(xml, sourceName, tier) {
  const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  return itemMatches
    .map((item) => {
      const title = extractTag(item, 'title');
      const link = extractTag(item, 'link');
      const pubDate = extractTag(item, 'pubDate');
      const description = extractTag(item, 'description');
      if (!title || !link) return null;
      return {
        source: sourceName,
        title,
        link,
        publishedAt: pubDate || null,
        snippet: description ? description.slice(0, 280) : null,
        tier,
      };
    })
    .filter(Boolean)
    .slice(0, 20);
}

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: {
        'User-Agent': 'HowSus-Feed-Refresher/1.0',
        Accept: 'application/rss+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5',
      },
    });

    if (!res.ok) {
      return {
        source: feed.name,
        ok: false,
        error: `HTTP ${res.status}`,
        entries: [],
      };
    }

    const text = await res.text();
    const looksLikeRss = /<rss|<feed|<item/i.test(text);
    if (!looksLikeRss) {
      return {
        source: feed.name,
        ok: false,
        error: 'Feed response was not RSS/Atom content',
        entries: [],
      };
    }

    return {
      source: feed.name,
      ok: true,
      entries: parseRss(text, feed.name, feed.tier ?? 3),
      error: null,
    };
  } catch (error) {
    return {
      source: feed.name,
      ok: false,
      error: error?.message || 'Unknown fetch error',
      entries: [],
    };
  }
}

async function main() {
  const results = await Promise.all(FEEDS.map(fetchFeed));
  const entries = results.flatMap((r) => r.entries);

  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'github-actions-static-refresh',
    feedStatus: results.map((r) => ({ source: r.source, ok: r.ok, error: r.error })),
    entryCount: entries.length,
    entries,
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${entries.length} feed entries to ${outputPath}`);
}

main().catch((err) => {
  console.error('Failed to refresh corroboration feed:', err);
  process.exit(1);
});
