const postList = document.getElementById('post-list');
const posts = Array.isArray(window.X13N_POSTS) ? window.X13N_POSTS : [];

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

function renderParagraph(paragraph) {
  const content = formatInlineMarkdown(String(paragraph)).replace(/\n/g, '<br>');
  return `<p>${content}</p>`;
}

function renderBody(paragraphs = []) {
  return paragraphs.map(renderParagraph).join('');
}

function renderPost(post) {
  return `
    <details class="post" id="${escapeHtml(post.slug)}" data-post-slug="${escapeHtml(post.slug)}">
      <summary class="post-summary">
        <h2 class="post-title">${escapeHtml(post.title)}</h2>
        <p class="post-date">${escapeHtml(post.written)}</p>
        <span class="post-link">Read More</span>
      </summary>

      <div class="post-content">
        <div class="post-body">
          ${renderBody(post.body)}
        </div>
        <button class="post-close" type="button" data-close-post>Close</button>
      </div>
    </details>
  `;
}

function findPostBySlug(slug) {
  return postList?.querySelector(`.post[data-post-slug="${CSS.escape(slug)}"]`) ?? null;
}

function closeAllPosts(exceptPost = null) {
  if (!postList) {
    return;
  }

  for (const post of postList.querySelectorAll('.post')) {
    if (post !== exceptPost) {
      post.open = false;
    }
  }
}

function syncPostFromHash() {
  if (!postList) {
    return;
  }

  const slug = decodeURIComponent(window.location.hash.slice(1));
  if (!slug) {
    closeAllPosts();
    return;
  }

  const matchedPost = findPostBySlug(slug);
  if (!matchedPost) {
    return;
  }

  closeAllPosts(matchedPost);
  matchedPost.open = true;
  matchedPost.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

if (postList) {
  postList.innerHTML = posts.map(renderPost).join('');

  for (const post of postList.querySelectorAll('.post')) {
    post.open = false;
  }

  postList.addEventListener(
    'toggle',
    (event) => {
      const currentPost = event.target;
      if (!(currentPost instanceof HTMLDetailsElement)) {
        return;
      }

      const slug = currentPost.dataset.postSlug;
      if (!currentPost.open) {
        if (slug && decodeURIComponent(window.location.hash.slice(1)) === slug) {
          history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        return;
      }

      for (const post of postList.querySelectorAll('.post')) {
        if (post !== currentPost) {
          post.open = false;
        }
      }
      currentPost.scrollIntoView({ block: 'start', behavior: 'smooth' });

      if (slug && decodeURIComponent(window.location.hash.slice(1)) !== slug) {
        window.location.hash = encodeURIComponent(slug);
      }
    },
    true,
  );

  postList.addEventListener('click', (event) => {
    const closeButton = event.target.closest('[data-close-post]');
    if (!closeButton) {
      return;
    }

    const post = closeButton.closest('.post');
    if (!post) {
      return;
    }

    post.open = false;

    if (decodeURIComponent(window.location.hash.slice(1)) === post.dataset.postSlug) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  });

  window.addEventListener('hashchange', syncPostFromHash);
  syncPostFromHash();
}
