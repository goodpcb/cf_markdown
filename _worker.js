import { marked } from 'marked';

// 配置 marked 使用 GitHub Flavored Markdown
marked.setOptions({
  gfm: true,
  breaks: false,
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // 处理 CORS 预检请求（可选）
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // 首页：列出所有文档
    if (path === '/' && method === 'GET') {
      try {
        const { results } = await env.DB.prepare('SELECT id FROM documents ORDER BY id').all();
        const listItems = results.map(row => `<li><a href="/doc/${encodeURIComponent(row.id)}">${escapeHtml(row.id)}</a></li>`).join('');
        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Markdown Docs</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    a { color: #0366d6; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>Markdown Documents</h1>
  <ul>${listItems || '<li>No documents yet.</li>'}</ul>
  <p>Create a new document via <code>POST /doc</code> with JSON: <code>{"id": "example", "content": "# Hello"}</code></p>
</body>
</html>`;
        return new Response(html, {
          headers: { 'Content-Type': 'text/html;charset=utf-8' },
        });
      } catch (err) {
        return new Response('Error fetching document list', { status: 500 });
      }
    }

    // 获取单个文档并渲染
    if (path.startsWith('/doc/') && method === 'GET') {
      const id = decodeURIComponent(path.slice(5)); // 去掉 '/doc/'
      if (!id) {
        return new Response('Invalid document ID', { status: 400 });
      }

      // 尝试从 KV 缓存获取
      const cacheKey = `doc:${id}`;
      try {
        const cached = await env.KV.get(cacheKey, 'text');
        if (cached) {
          return new Response(cached, {
            headers: { 'Content-Type': 'text/html;charset=utf-8' },
          });
        }
      } catch (err) {
        // 忽略缓存错误，继续查询 D1
      }

      // 从 D1 查询
      try {
        const stmt = env.DB.prepare('SELECT content FROM documents WHERE id = ?').bind(id);
        const row = await stmt.first();
        if (!row) {
          return new Response('Document not found', { status: 404 });
        }

        // 渲染 Markdown
        const markdown = row.content;
        const bodyHtml = marked.parse(markdown);

        // 构建完整 HTML 页面
        const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(id)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    pre { background: #f6f8fa; padding: 1rem; overflow: auto; border-radius: 6px; }
    code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; }
    img { max-width: 100%; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 1rem; color: #555; }
    table { border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 6px 13px; }
    th { background: #f6f8fa; }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;

        // 存入 KV 缓存（1 小时）
        try {
          await env.KV.put(cacheKey, fullHtml, { expirationTtl: 3600 });
        } catch (err) {
          // 缓存失败不影响响应
        }

        return new Response(fullHtml, {
          headers: { 'Content-Type': 'text/html;charset=utf-8' },
        });
      } catch (err) {
        return new Response('Database error', { status: 500 });
      }
    }

    // 创建或更新文档
    if (path === '/doc' && method === 'POST') {
      let id, content;
      const contentType = request.headers.get('Content-Type') || '';

      try {
        if (contentType.includes('application/json')) {
          const json = await request.json();
          id = json.id;
          content = json.content;
        } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
          const form = await request.formData();
          id = form.get('id');
          content = form.get('content');
        } else {
          return new Response('Unsupported Content-Type. Use JSON or form data.', { status: 415 });
        }

        if (!id || !content) {
          return new Response('Both "id" and "content" are required', { status: 400 });
        }

        // 插入或更新 D1
        const stmt = env.DB.prepare(
          `INSERT INTO documents (id, content) VALUES (?, ?)
           ON CONFLICT(id) DO UPDATE SET content = excluded.content`
        ).bind(id, content);
        await stmt.run();

        // 清除 KV 缓存
        try {
          await env.KV.delete(`doc:${id}`);
        } catch (err) {
          // 忽略
        }

        return new Response(JSON.stringify({ success: true, id }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (err) {
        return new Response('Invalid request body', { status: 400 });
      }
    }

    // 其他路径
    return new Response('Not Found', { status: 404 });
  },
};

// 简单的 HTML 转义函数，用于在列表中安全显示 ID
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
