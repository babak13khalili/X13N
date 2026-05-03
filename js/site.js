const postList = document.getElementById('post-list');
const posts = Array.isArray(window.X13N_POSTS) ? window.X13N_POSTS : [];

const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const SCROLL_OPTIONS = { block: 'start', behavior: prefersReducedMotion ? 'auto' : 'smooth' };

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/(\*\*\*|___)([\s\S]+?)\1/g, '<strong><em>$2</em></strong>')
    .replace(/(\*\*|__)([\s\S]+?)\1/g, '<strong>$2</strong>')
    .replace(/(\*|_)([^\n]+?)\1/g, '<em>$2</em>');
}

function renderBody(paragraphs = []) {
  return paragraphs
    .map((paragraph) => `<p>${formatInlineMarkdown(String(paragraph)).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function renderPost(post) {
  const slug = escapeHtml(post.slug);
  return `
    <details class="post" id="${slug}" data-post-slug="${slug}">
      <summary class="post-summary">
        <h2 class="post-title">${escapeHtml(post.title)}</h2>
        <p class="post-date">${escapeHtml(post.written)}</p>
        <span class="post-link">Read More</span>
      </summary>

      <div class="post-content">
        <div class="post-body">${renderBody(post.body)}</div>
        <button class="post-close" type="button" data-close-post>Close</button>
      </div>
    </details>
  `;
}

function getCurrentSlug() {
  return decodeURIComponent(window.location.hash.slice(1));
}

function clearHashIfMatches(slug) {
  if (slug && getCurrentSlug() === slug) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

function findPostBySlug(slug) {
  return postList.querySelector(`.post[data-post-slug="${CSS.escape(slug)}"]`);
}

function closeOtherPosts(exceptPost) {
  for (const post of postList.querySelectorAll('.post[open]')) {
    if (post !== exceptPost) {
      post.open = false;
    }
  }
}

function syncPostFromHash() {
  const slug = getCurrentSlug();
  if (!slug) {
    closeOtherPosts(null);
    return;
  }

  const matchedPost = findPostBySlug(slug);
  if (!matchedPost) {
    return;
  }

  closeOtherPosts(matchedPost);
  matchedPost.open = true;
  matchedPost.scrollIntoView(SCROLL_OPTIONS);
}

function handleToggle(event) {
  const post = event.target;
  if (!(post instanceof HTMLDetailsElement)) {
    return;
  }

  const { postSlug } = post.dataset;

  if (!post.open) {
    clearHashIfMatches(postSlug);
    return;
  }

  closeOtherPosts(post);
  post.scrollIntoView(SCROLL_OPTIONS);

  if (postSlug && getCurrentSlug() !== postSlug) {
    window.location.hash = encodeURIComponent(postSlug);
  }
}

function handleClick(event) {
  const closeButton = event.target.closest('[data-close-post]');
  const post = closeButton?.closest('.post');
  if (!post) {
    return;
  }

  post.open = false;
  clearHashIfMatches(post.dataset.postSlug);
}

function handleKeydown(event) {
  if (event.key !== 'Escape') {
    return;
  }

  const openPost = postList.querySelector('.post[open]');
  if (!openPost) {
    return;
  }

  openPost.open = false;
  clearHashIfMatches(openPost.dataset.postSlug);
}

if (postList) {
  postList.innerHTML = posts.map(renderPost).join('');

  postList.addEventListener('toggle', handleToggle, true);
  postList.addEventListener('click', handleClick);
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('hashchange', syncPostFromHash);

  syncPostFromHash();
}
