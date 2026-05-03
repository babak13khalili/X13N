import { readdir, readFile, watch, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const postsDir = path.join(rootDir, 'posts');
const outputFile = path.join(rootDir, 'js', 'posts.js');
const rssOutputFile = path.join(rootDir, 'feed.xml');
const jsonFeedOutputFile = path.join(rootDir, 'feed.json');
const watchMode = process.argv.includes('--watch');

const site = {
  title: 'X13N',
  description: 'New writings published on X13N.',
  url: 'https://babak13khalili.github.io/X13N',
};

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const WRITTEN_DATE_RE = /^(\d{2})-(\d{2})-(\d{4})$/;
const INLINE_BOLD_ITALIC_RE = /(\*\*\*|___)([\s\S]+?)\1/g;
const INLINE_BOLD_RE = /(\*\*|__)([\s\S]+?)\1/g;
const INLINE_ITALIC_RE = /(\*|_)([^\n]+?)\1/g;

function splitParagraphs(text) {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\r/g, '').trim())
    .filter(Boolean);
}

function parseFrontmatter(markdown) {
  const match = markdown.match(FRONTMATTER_RE);
  if (!match) {
    return { metadata: {}, bodyText: markdown.trim() };
  }

  const [, frontmatterText, bodyText] = match;
  const metadata = {};

  for (const rawLine of frontmatterText.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;

    metadata[line.slice(0, separatorIndex).trim()] = line.slice(separatorIndex + 1).trim();
  }

  return { metadata, bodyText: bodyText.trim() };
}

function titleFromFilename(filename) {
  return path
    .basename(filename, '.md')
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function slugFromFilename(filename) {
  return path.basename(filename, '.md').toLowerCase();
}

function parseWrittenDate(value) {
  const match = String(value).match(WRITTEN_DATE_RE);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return Number.isNaN(date.getTime()) ? null : date;
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function stripInlineMarkdown(value) {
  return String(value ?? '')
    .replace(INLINE_BOLD_ITALIC_RE, '$2')
    .replace(INLINE_BOLD_RE, '$2')
    .replace(INLINE_ITALIC_RE, '$2');
}

function buildPostUrl(slug) {
  return `${site.url}/#${encodeURIComponent(slug)}`;
}

function buildPostSummary(body) {
  if (!Array.isArray(body) || body.length === 0) {
    return '';
  }

  const paragraphs = body.map((paragraph) => stripInlineMarkdown(paragraph).trim()).filter(Boolean);
  const summary = paragraphs.find((paragraph) => paragraph.replace(/\s+/g, ' ').length > 40) ?? paragraphs[0] ?? '';
  return summary.replace(/\n+/g, ' ');
}

function feedItems(sortedPosts) {
  return sortedPosts.map((post) => ({
    ...post,
    url: buildPostUrl(post.slug),
    summary: buildPostSummary(post.body),
  }));
}

function buildRssFeed(items) {
  const lastBuildDate = new Date().toUTCString();
  const renderedItems = items
    .map((item) => {
      const pubDate = item.publishedAt
        ? `\n      <pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>`
        : '';

      return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.url)}</link>
      <guid>${escapeXml(item.url)}</guid>${pubDate}
      <description>${escapeXml(item.summary)}</description>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(site.title)}</title>
    <link>${escapeXml(site.url)}</link>
    <description>${escapeXml(site.description)}</description>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
${renderedItems}
  </channel>
</rss>
`;
}

function buildJsonFeed(items) {
  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: site.title,
    home_page_url: site.url,
    feed_url: `${site.url}/feed.json`,
    description: site.description,
    items: items.map((item) => ({
      id: item.url,
      url: item.url,
      title: item.title,
      content_text: item.body.join('\n\n'),
      summary: item.summary,
      date_published: item.publishedAt || undefined,
    })),
  };

  return `${JSON.stringify(feed, null, 2)}\n`;
}

async function loadPosts() {
  const files = (await readdir(postsDir))
    .filter((file) => file.endsWith('.md') && !file.startsWith('_'))
    .sort();

  const posts = await Promise.all(
    files.map(async (file) => {
      const markdown = await readFile(path.join(postsDir, file), 'utf8');
      const { metadata, bodyText } = parseFrontmatter(markdown);
      const writtenDate = parseWrittenDate(metadata.written || '');

      return {
        slug: slugFromFilename(file),
        title: metadata.title || titleFromFilename(file),
        written: metadata.written || '',
        body: splitParagraphs(bodyText),
        publishedAt: writtenDate ? writtenDate.toISOString() : null,
        sortValue: writtenDate ? writtenDate.getTime() : 0,
      };
    }),
  );

  return posts;
}

function compareDescByDate(a, b) {
  return b.sortValue - a.sortValue || a.title.localeCompare(b.title);
}

function logBuild(count) {
  const time = new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  console.log(`[${time}] Built ${count} posts into js/posts.js, feed.xml, and feed.json`);
}

async function buildPosts() {
  const posts = await loadPosts();

  const ascending = [...posts].sort((a, b) => a.sortValue - b.sortValue || a.title.localeCompare(b.title));
  const descending = [...posts].sort(compareDescByDate);

  const browserPosts = ascending.map(({ sortValue, publishedAt, ...post }) => post);
  const items = feedItems(descending);

  const output = `// Generated by scripts/build-posts.mjs\nwindow.X13N_POSTS = ${JSON.stringify(browserPosts, null, 2)};\n`;

  await Promise.all([
    writeFile(outputFile, output, 'utf8'),
    writeFile(rssOutputFile, buildRssFeed(items), 'utf8'),
    writeFile(jsonFeedOutputFile, buildJsonFeed(items), 'utf8'),
  ]);

  logBuild(browserPosts.length);
}

async function run() {
  await buildPosts();

  if (!watchMode) {
    return;
  }

  console.log('Watching posts/ for changes...');

  let rebuildTimer;
  for await (const event of watch(postsDir)) {
    if (!event.filename || !String(event.filename).endsWith('.md')) {
      continue;
    }

    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      buildPosts().catch((error) => {
        console.error('Build failed:', error.message);
      });
    }, 120);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
