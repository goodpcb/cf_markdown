import { marked } from 'marked';

// 配置 marked
marked.setOptions({
  gfm: true,
  breaks: false,
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS 预检（可选）
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // 根路径重定向到 /admin
    if (path === '/' && method === 'GET') {
      return Response.redirect('/admin', 302);
    }

    // ---------- 登录/登出 ----------
    if (path === '/admin' && method === 'GET') {
      const loggedIn = isLoggedIn(request);
      if (loggedIn) {
        return handleAdminPanel(env);
      } else {
        return handleLoginPage();
      }
    }

    if (path === '/admin/login' && method === 'POST') {
      const formData = await request.formData();
      const password = formData.get('password') || '';
      if (password === env.ADMIN_PASSWORD) {
        // 登录成功，设置 Cookie
        const headers = new Headers({
          'Set-Cookie': 'admin_session=1; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400',
          'Location': '/admin',
        });
        return new Response(null, { status: 302, headers });
      } else {
        // 密码错误
        return new Response(renderLoginPage('密码错误，请重试'), {
          headers: { 'Content-Type': 'text/html;charset=utf-8' },
          status: 401,
        });
      }
    }

    if (path === '/admin/logout' && method === 'GET') {
      const headers = new Headers({
        'Set-Cookie': 'admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
        'Location': '/admin',
      });
      return new Response(null, { status: 302, headers });
    }

    // ---------- 文档操作 ----------
    // 查看文档
    if (path.startsWith('/doc/') && method === 'GET') {
      const id = decodeURIComponent(path.slice(5));
      if (!id) return new Response('Invalid ID', { status: 400 });
      return handleViewDoc(id, env, isLoggedIn(request));
    }

    // 编辑页面（需登录）
    if (path.startsWith('/edit/') && method === 'GET') {
      if (!isLoggedIn(request)) {
        return new Response('请先登录', {
          status: 302,
          headers: { 'Location': '/admin' },
        });
      }
      const id = decodeURIComponent(path.slice(6));
      if (!id) return new Response('Invalid ID', { status: 400 });
      return handleEditPage(id, env);
    }

    // 保存文档（创建/更新，需登录）
    if (path === '/doc' && method === 'POST') {
      if (!isLoggedIn(request)) {
        return new Response('Unauthorized', { status: 401 });
      }
      const formData = await request.formData();
      const id = formData.get('id') || '';
      const content = formData.get('content') || '';
      if (!id || !content) {
        return new Response('id 和 content 均不能为空', { status: 400 });
      }
      // 写入 D1
      const stmt = env.DB.prepare(
        `INSERT INTO documents (id, content) VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET content = excluded.content`
      ).bind(id, content);
      await stmt.run();
      // 清除 KV 缓存
      const cacheKey = `doc:${id}`;
      try {
        await env.KV.delete(cacheKey);
      } catch (e) {
        // 忽略缓存删除错误
      }
      // 重定向到查看页
      return Response.redirect(`/doc/${encodeURIComponent(id)}`, 302);
    }

    // 其他路径 404
    return new Response('Not Found', { status: 404 });
  },
};

// ---------- 辅助函数 ----------
// 检查是否已登录（简单 Cookie 检查）
function isLoggedIn(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  return cookieHeader.includes('admin_session=1');
}

// 登录页面 HTML
function handleLoginPage(errorMsg = '') {
  const html = renderLoginPage(errorMsg);
  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  });
}

function renderLoginPage(errorMsg = '') {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>管理员登录</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 400px; margin: 3rem auto; padding: 0 1rem; }
    input[type="password"] { width: 100%; padding: 0.5rem; margin: 0.5rem 0; }
    button { padding: 0.5rem 1.5rem; }
    .error { color: red; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <h1>管理员登录</h1>
  ${errorMsg ? `<p class="error">${escapeHtml(errorMsg)}</p>` : ''}
  <form method="POST" action="/admin/login">
    <label for="password">密码：</label>
    <input type="password" id="password" name="password" required autofocus>
    <button type="submit">登录</button>
  </form>
</body>
</html>`;
}

// 管理面板
async function handleAdminPanel(env) {
  const { results } = await env.DB.prepare('SELECT id FROM documents ORDER BY id').all();
  const listItems = results.map(row => `
    <li>
      <a href="/doc/${encodeURIComponent(row.id)}">${escapeHtml(row.id)}</a>
      <a href="/edit/${encodeURIComponent(row.id)}" style="margin-left:1rem;">编辑</a>
    </li>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>文档管理</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    textarea { width: 100%; height: 200px; margin: 0.5rem 0; }
    input[type="text"] { width: 100%; padding: 0.5rem; margin: 0.5rem 0; }
    button { padding: 0.5rem 1.5rem; }
    .logout { float: right; }
  </style>
</head>
<body>
  <div class="logout"><a href="/admin/logout">退出登录</a></div>
  <h1>文档管理</h1>
  <h2>已有文档</h2>
  <ul>${listItems || '<li>暂无文档</li>'}</ul>
  <h2>新建文档</h2>
  <form method="POST" action="/doc">
    <label for="id">文档 ID：</label>
    <input type="text" id="id" name="id" required>
    <label for="content">Markdown 内容：</label>
    <textarea id="content" name="content" required></textarea>
    <button type="submit">保存</button>
  </form>
</body>
</html>`;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  });
}

// 查看文档页面
async function handleViewDoc(id, env, loggedIn) {
  // 尝试从 KV 缓存获取
  const cacheKey = `doc:${id}`;
  if (loggedIn) {
    // 登录用户也使用缓存，但缓存中不包含编辑按钮，所以需要动态插入？
    // 简化：登录用户不使用缓存，直接查询 D1 并渲染（保证编辑按钮出现）
  } else {
    try {
      const cached = await env.KV.get(cacheKey, 'text');
      if (cached) {
        return new Response(cached, {
          headers: { 'Content-Type': 'text/html;charset=utf-8' },
        });
      }
    } catch (e) {
      // 忽略缓存错误
    }
  }

  // 从 D1 查询
  const stmt = env.DB.prepare('SELECT content FROM documents WHERE id = ?').bind(id);
  const row = await stmt.first();
  if (!row) {
    return new Response('文档不存在', { status: 404 });
  }

  const markdown = row.content;
  const bodyHtml = marked.parse(markdown);

  // 构建页面（包含编辑按钮，如果已登录）
  const editButton = loggedIn
    ? `<div style="margin-bottom:1rem;"><a href="/edit/${encodeURIComponent(id)}">✏️ 编辑此文档</a></div>`
    : '';

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
    a { color: #0366d6; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  ${editButton}
  ${bodyHtml}
</body>
</html>`;

  // 仅在未登录时缓存（登录用户可能期望看到编辑按钮，而缓存中没有）
  if (!loggedIn) {
    try {
      await env.KV.put(cacheKey, fullHtml, { expirationTtl: 3600 });
    } catch (e) {
      // 忽略缓存写入错误
    }
  }

  return new Response(fullHtml, {
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  });
}

// 编辑页面
async function handleEditPage(id, env) {
  const stmt = env.DB.prepare('SELECT content FROM documents WHERE id = ?').bind(id);
  const row = await stmt.first();
  if (!row) {
    return new Response('文档不存在', { status: 404 });
  }

  const content = row.content;
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>编辑 ${escapeHtml(id)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    textarea { width: 100%; height: 400px; margin: 0.5rem 0; }
    input[type="text"] { width: 100%; padding: 0.5rem; margin: 0.5rem 0; }
    button { padding: 0.5rem 1.5rem; }
  </style>
</head>
<body>
  <h1>编辑文档：${escapeHtml(id)}</h1>
  <form method="POST" action="/doc">
    <input type="hidden" name="id" value="${escapeHtml(id)}">
    <label for="content">Markdown 内容：</label>
    <textarea id="content" name="content" required>${escapeHtml(content)}</textarea>
    <button type="submit">保存</button>
    <a href="/doc/${encodeURIComponent(id)}">取消</a>
  </form>
</body>
</html>`;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  });
}

// 简单的 HTML 转义（避免 XSS）
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
