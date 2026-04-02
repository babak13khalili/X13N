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

function splitParagraphs(text) {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\r/g, '').trim())
    .filter(Boolean);
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
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

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    metadata[key] = value;
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
  const match = String(value).match(/^(\d{2})-(\d{2})-(\d{4})$/);
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
    .replace(/(\*\*\*|___)([\s\S]+?)\1/g, '$2')
    .replace(/(\*\*|__)([\s\S]+?)\1/g, '$2')
    .replace(/(\*|_)([^\n]+?)\1/g, '$2');
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

function buildRssFeed(posts) {
  const lastBuildDate = new Date().toUTCString();
  const items = [...posts]
    .sort((a, b) => b.sortValue - a.sortValue || a.title.localeCompare(b.title))
    .map((post) => {
      const postUrl = buildPostUrl(post.slug);
      const summary = escapeXml(buildPostSummary(post.body));
      const pubDate = post.publishedAt ? `\n      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>` : '';

      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(postUrl)}</link>
      <guid>${escapeXml(postUrl)}</guid>${pubDate}
      <description>${summary}</description>
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
${items}
  </channel>
</rss>
`;
}

function buildJsonFeed(posts) {
  const items = [...posts]
    .sort((a, b) => b.sortValue - a.sortValue || a.title.localeCompare(b.title))
    .map((post) => ({
      id: buildPostUrl(post.slug),
      url: buildPostUrl(post.slug),
      title: post.title,
      content_text: post.body.join('\n\n'),
      summary: buildPostSummary(post.body),
      date_published: post.publishedAt || undefined,
    }));

  return `${JSON.stringify(
    {
      version: 'https://jsonfeed.org/version/1.1',
      title: site.title,
      home_page_url: site.url,
      feed_url: `${site.url}/feed.json`,
      description: site.description,
      items,
    },
    null,
    2,
  )}\n`;
}

async function buildPosts() {
  const files = (await readdir(postsDir))
    .filter((file) => file.endsWith('.md') && !file.startsWith('_'))
    .sort();

  const posts = [];

  for (const file of files) {
    const markdown = await readFile(path.join(postsDir, file), 'utf8');
    const { metadata, bodyText } = parseFrontmatter(markdown);
    const title = metadata.title || titleFromFilename(file);
    const written = metadata.written || '';
    const writtenDate = parseWrittenDate(written);

    posts.push({
      slug: slugFromFilename(file),
      title,
      written,
      body: splitParagraphs(bodyText),
      publishedAt: writtenDate ? writtenDate.toISOString() : null,
      sortValue: writtenDate ? writtenDate.getTime() : 0,
    });
  }

  posts.sort((a, b) => a.sortValue - b.sortValue || a.title.localeCompare(b.title));

  const browserPosts = posts.map(({ sortValue, publishedAt, ...post }) => post);
  const output = `// Generated by scripts/build-posts.mjs\nwindow.X13N_POSTS = ${JSON.stringify(browserPosts, null, 2)};\n`;
  const rssFeed = buildRssFeed(posts);
  const jsonFeed = buildJsonFeed(posts);

  await Promise.all([
    writeFile(outputFile, output, 'utf8'),
    writeFile(rssOutputFile, rssFeed, 'utf8'),
    writeFile(jsonFeedOutputFile, jsonFeed, 'utf8'),
  ]);
  console.log(
    `[${new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })}] Built ${browserPosts.length} posts into js/posts.js, feed.xml, and feed.json`,
  );
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
