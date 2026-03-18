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
    <details class="post">
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

if (postList) {
  postList.innerHTML = posts.map(renderPost).join('');

  for (const post of postList.querySelectorAll('.post')) {
    post.open = false;
  }

  postList.addEventListener(
    'toggle',
    (event) => {
      const currentPost = event.target;
      if (!(currentPost instanceof HTMLDetailsElement) || !currentPost.open) {
        return;
      }

      for (const post of postList.querySelectorAll('.post')) {
        if (post !== currentPost) {
          post.open = false;
        }
      }
    },
    true,
  );

  postList.addEventListener('click', (event) => {
    const closeButton = event.target.closest('[data-close-post]');
    if (!closeButton) {
      return;
    }

    closeButton.closest('.post').open = false;
  });
}
