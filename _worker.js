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

    // CORS 预检
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // ---------- 根路径：欢迎页面 ----------
    if (path === '/' && method === 'GET') {
      return handleWelcomePage();
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
        const headers = new Headers({
          'Set-Cookie': 'admin_session=1; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400',
          'Location': '/admin',
        });
        return new Response(null, { status: 302, headers });
      } else {
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

    // 下载原始 Markdown
    if (path.startsWith('/raw/') && method === 'GET') {
      const id = decodeURIComponent(path.slice(5));
      if (!id) return new Response('Invalid ID', { status: 400 });
      return handleRawDoc(id, env);
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
      try {
        const formData = await request.formData();
        const id = formData.get('id') || '';
        const content = formData.get('content') || '';
        if (!id || !content) {
          return new Response('id 和 content 均不能为空', { status: 400 });
        }
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
          // 忽略
        }
        const redirectUrl = new URL(`/doc/${encodeURIComponent(id)}`, request.url).toString();
        return Response.redirect(redirectUrl, 302);
      } catch (err) {
        // 调试用：返回具体错误
        return new Response('保存失败: ' + err.message + '\n' + err.stack, {
          status: 500,
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        });
      }
    }

    // 其他路径 404
    return new Response('Not Found', { status: 404 });
  },
};

// ---------- 辅助函数 ----------

// 检查是否已登录
function isLoggedIn(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  return cookieHeader.includes('admin_session=1');
}

// 欢迎页面
function handleWelcomePage() {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Markdown 文档中心</title>
  <style>
    :root {
      --primary: #4f46e5;
      --primary-hover: #4338ca;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #1e293b;
      --text-secondary: #64748b;
      --shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .container {
      max-width: 600px;
      width: 100%;
      background: var(--card-bg);
      border-radius: 16px;
      box-shadow: var(--shadow);
      padding: 2rem;
      text-align: center;
    }
    h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
      color: var(--primary);
    }
    .subtitle {
      color: var(--text-secondary);
      margin-bottom: 2rem;
    }
    .btn {
      display: inline-block;
      background: var(--primary);
      color: white;
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 500;
      transition: background 0.2s;
      margin: 0.25rem;
    }
    .btn:hover {
      background: var(--primary-hover);
    }
    .btn-secondary {
      background: #e2e8f0;
      color: var(--text);
    }
    .btn-secondary:hover {
      background: #cbd5e1;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📝 Markdown 文档中心</h1>
    <p class="subtitle">一个简单的 Markdown 文档管理服务</p>
    <div>
      <a href="/admin" class="btn">🔐 管理员登录</a>
      <a href="/doc/示例文档" class="btn btn-secondary">查看示例</a>
    </div>
  </div>
</body>
</html>`;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  });
}

// 登录页面 HTML
function handleLoginPage(errorMsg = '') {
  return new Response(renderLoginPage(errorMsg), {
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  });
}

function renderLoginPage(errorMsg = '') {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>管理员登录</title>
  <style>
    :root {
      --primary: #4f46e5;
      --primary-hover: #4338ca;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #1e293b;
      --error: #dc2626;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
    }
    .card {
      background: var(--card-bg);
      padding: 2rem;
      border-radius: 16px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      width: 100%;
      max-width: 400px;
    }
    h1 { text-align: center; margin-bottom: 1.5rem; color: var(--text); }
    label { display: block; margin-bottom: 0.5rem; color: var(--text); }
    input[type="password"] {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 1rem;
      margin-bottom: 1rem;
    }
    button {
      width: 100%;
      background: var(--primary);
      color: white;
      padding: 0.75rem;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: var(--primary-hover); }
    .error {
      color: var(--error);
      background: #fee2e2;
      padding: 0.75rem;
      border-radius: 8px;
      margin-bottom: 1rem;
      text-align: center;
    }
    .back-link {
      display: block;
      text-align: center;
      margin-top: 1rem;
      color: #64748b;
      text-decoration: none;
    }
    .back-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>管理员登录</h1>
    ${errorMsg ? `<div class="error">${escapeHtml(errorMsg)}</div>` : ''}
    <form method="POST" action="/admin/login">
      <label for="password">密码：</label>
      <input type="password" id="password" name="password" required autofocus>
      <button type="submit">登录</button>
    </form>
    <a href="/" class="back-link">← 返回首页</a>
  </div>
</body>
</html>`;
}

// 管理面板
async function handleAdminPanel(env) {
  const { results } = await env.DB.prepare('SELECT id FROM documents ORDER BY id').all();
  const listItems = results.map(row => `
    <li class="doc-item">
      <span class="doc-id">${escapeHtml(row.id)}</span>
      <div class="actions">
        <a href="/doc/${encodeURIComponent(row.id)}" class="btn btn-small">查看</a>
        <a href="/edit/${encodeURIComponent(row.id)}" class="btn btn-small btn-edit">编辑</a>
        <a href="/raw/${encodeURIComponent(row.id)}" class="btn btn-small btn-download">下载</a>
      </div>
    </li>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>文档管理</title>
  <style>
    :root {
      --primary: #4f46e5;
      --primary-hover: #4338ca;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #1e293b;
      --text-secondary: #64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 1rem;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      flex-wrap: wrap;
      gap: 1rem;
    }
    h1 { font-size: 2rem; color: var(--primary); }
    .logout {
      background: #fee2e2;
      color: #dc2626;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 500;
    }
    .logout:hover { background: #fecaca; }
    .card {
      background: var(--card-bg);
      border-radius: 12px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      padding: 1.5rem;
      margin-bottom: 2rem;
    }
    .card h2 {
      margin-bottom: 1rem;
      font-size: 1.25rem;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 0.5rem;
    }
    ul.doc-list {
      list-style: none;
    }
    .doc-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 0;
      border-bottom: 1px solid #f1f5f9;
      gap: 1rem;
    }
    .doc-item:last-child { border-bottom: none; }
    .doc-id { font-weight: 500; word-break: break-all; }
    .actions { display: flex; gap: 0.5rem; flex-shrink: 0; }
    .btn {
      display: inline-block;
      background: var(--primary);
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      text-decoration: none;
      font-size: 0.875rem;
      transition: background 0.2s;
      border: none;
      cursor: pointer;
    }
    .btn:hover { background: var(--primary-hover); }
    .btn-small { padding: 0.35rem 0.75rem; }
    .btn-edit { background: #f59e0b; }
    .btn-edit:hover { background: #d97706; }
    .btn-download { background: #10b981; }
    .btn-download:hover { background: #059669; }
    form {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    label { font-weight: 500; }
    input[type="text"], textarea {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 1rem;
      font-family: inherit;
    }
    textarea { height: 200px; resize: vertical; }
    button[type="submit"] {
      background: var(--primary);
      color: white;
      padding: 0.75rem;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      cursor: pointer;
      transition: background 0.2s;
    }
    button[type="submit"]:hover { background: var(--primary-hover); }
    .empty { color: var(--text-secondary); text-align: center; padding: 2rem; }
    @media (max-width: 600px) {
      .doc-item { flex-direction: column; align-items: flex-start; }
      .actions { width: 100%; justify-content: flex-start; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>📚 文档管理</h1>
      <a href="/admin/logout" class="logout">退出登录</a>
    </header>
    <div class="card">
      <h2>已有文档</h2>
      <ul class="doc-list">${listItems || '<p class="empty">暂无文档</p>'}</ul>
    </div>
    <div class="card">
      <h2>新建文档</h2>
      <form method="POST" action="/doc">
        <label for="id">文档 ID：</label>
        <input type="text" id="id" name="id" required placeholder="例如：my-first-doc">
        <label for="content">Markdown 内容：</label>
        <textarea id="content" name="content" required placeholder="输入 Markdown..."></textarea>
        <button type="submit">保存</button>
      </form>
    </div>
  </div>
</body>
</html>`;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  });
}

// 查看文档页面
async function handleViewDoc(id, env, loggedIn) {
  try {
    const cacheKey = `doc:${id}`;
    // 登录用户跳过缓存，以确保能看到编辑按钮
    if (!loggedIn) {
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

    const stmt = env.DB.prepare('SELECT content FROM documents WHERE id = ?').bind(id);
    const row = await stmt.first();
    if (!row) {
      return new Response('文档不存在', { status: 404 });
    }

    const markdown = row.content;
    const bodyHtml = marked.parse(markdown);

    // 构建操作按钮
    const editButton = loggedIn
      ? `<a href="/edit/${encodeURIComponent(id)}" class="btn btn-edit">✏️ 编辑</a>`
      : '';
    const backButton = loggedIn
      ? `<a href="/admin" class="btn btn-back">← 返回列表</a>`
      : `<a href="/" class="btn btn-back">← 首页</a>`;
    const actionBar = `
      <div class="action-bar">
        ${backButton}
        ${editButton}
        <a href="/raw/${encodeURIComponent(id)}" class="btn btn-download">⬇️ 下载 Markdown</a>
        <button onclick="exportHTML()" class="btn btn-export">📄 导出 HTML</button>
        <button onclick="window.print()" class="btn btn-print">🖨️ 打印 / PDF</button>
      </div>`;

    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(id)}</title>
  <style>
    :root {
      --primary: #4f46e5;
      --primary-hover: #4338ca;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #1e293b;
      --text-secondary: #64748b;
      --shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 1rem;
      min-height: 100vh;
      display: flex;
      justify-content: center;
    }
    .page-container {
      max-width: 800px;
      width: 100%;
      background: var(--card-bg);
      border-radius: 16px;
      box-shadow: var(--shadow);
      padding: 2rem;
    }
    h1, h2, h3, h4, h5, h6 { margin: 1.5rem 0 0.5rem; }
    h1:first-child { margin-top: 0; }
    pre { background: #f6f8fa; padding: 1rem; overflow: auto; border-radius: 8px; }
    code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; background: #f6f8fa; padding: 0.2em 0.4em; border-radius: 4px; }
    pre code { background: none; padding: 0; }
    img { max-width: 100%; border-radius: 8px; }
    blockquote { border-left: 4px solid #ddd; margin: 1rem 0; padding-left: 1rem; color: #555; }
    table { border-collapse: collapse; margin: 1rem 0; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f6f8fa; font-weight: 600; }
    a { color: var(--primary); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .action-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #e2e8f0;
    }
    .btn {
      display: inline-block;
      background: var(--primary);
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      text-decoration: none;
      font-size: 0.9rem;
      border: none;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn:hover { background: var(--primary-hover); }
    .btn-edit { background: #f59e0b; }
    .btn-edit:hover { background: #d97706; }
    .btn-download { background: #10b981; }
    .btn-download:hover { background: #059669; }
    .btn-export { background: #8b5cf6; }
    .btn-export:hover { background: #7c3aed; }
    .btn-print { background: #64748b; }
    .btn-print:hover { background: #475569; }
    .btn-back { background: #94a3b8; }
    .btn-back:hover { background: #64748b; }
    @media print {
      .action-bar { display: none; }
      body { background: white; padding: 0; }
      .page-container { box-shadow: none; border-radius: 0; padding: 1cm; }
    }
    @media (max-width: 600px) {
      .page-container { padding: 1.5rem; }
      .action-bar { justify-content: center; }
    }
  </style>
</head>
<body>
  <div class="page-container" id="document-content">
    ${actionBar}
    <div id="markdown-body">
      ${bodyHtml}
    </div>
  </div>
  <script>
    function exportHTML() {
      const content = document.getElementById('markdown-body').innerHTML;
      const title = document.title;
      const html = \`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>\${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    pre { background: #f6f8fa; padding: 1rem; overflow: auto; border-radius: 6px; }
    code { font-family: monospace; background: #f6f8fa; padding: 0.2em 0.4em; border-radius: 4px; }
    pre code { background: none; padding: 0; }
    img { max-width: 100%; }
    blockquote { border-left: 4px solid #ddd; padding-left: 1rem; color: #555; }
    table { border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 6px 13px; }
    th { background: #f6f8fa; }
  </style>
</head>
<body>
  \${content}
</body>
</html>\`;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = title + '.html';
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(a.href);
      a.remove();
    }
  </script>
</body>
</html>`;

    // 未登录时缓存
    if (!loggedIn) {
      try {
        await env.KV.put(cacheKey, fullHtml, { expirationTtl: 3600 });
      } catch (e) {
        // 忽略
      }
    }

    return new Response(fullHtml, {
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  } catch (err) {
    return new Response('查看失败: ' + err.message + '\n' + err.stack, {
      status: 500,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    });
  }
}

// 下载原始 Markdown
async function handleRawDoc(id, env) {
  try {
    const stmt = env.DB.prepare('SELECT content FROM documents WHERE id = ?').bind(id);
    const row = await stmt.first();
    if (!row) {
      return new Response('文档不存在', { status: 404 });
    }
    const headers = new Headers();
    headers.set('Content-Type', 'text/markdown;charset=utf-8');
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(id)}.md"`);
    return new Response(row.content, { headers });
  } catch (err) {
    return new Response('下载失败: ' + err.message, { status: 500 });
  }
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
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>编辑 ${escapeHtml(id)}</title>
  <style>
    :root {
      --primary: #4f46e5;
      --primary-hover: #4338ca;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #1e293b;
      --text-secondary: #64748b;
      --shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 1rem;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }
    h1 { color: var(--primary); }
    .editor-wrapper {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      align-items: start;
    }
    .editor-pane, .preview-pane {
      background: var(--card-bg);
      border-radius: 12px;
      box-shadow: var(--shadow);
      padding: 1.5rem;
    }
    .editor-pane h2, .preview-pane h2 {
      margin-bottom: 1rem;
      font-size: 1.25rem;
      color: var(--text);
    }
    textarea {
      width: 100%;
      height: 500px;
      padding: 1rem;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.95rem;
      resize: vertical;
      background: #f8fafc;
    }
    .preview-content {
      min-height: 500px;
      padding: 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow-y: auto;
      max-height: 600px;
    }
    .preview-content h1, .preview-content h2, .preview-content h3 {
      margin: 1rem 0 0.5rem;
    }
    .preview-content pre {
      background: #f6f8fa;
      padding: 1rem;
      overflow: auto;
      border-radius: 6px;
    }
    .preview-content code {
      font-family: monospace;
      background: #f6f8fa;
      padding: 0.2em 0.4em;
      border-radius: 4px;
    }
    .preview-content pre code { background: none; padding: 0; }
    .preview-content img { max-width: 100%; }
    .preview-content blockquote {
      border-left: 4px solid #ddd;
      padding-left: 1rem;
      color: #555;
    }
    .actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 1.5rem;
      justify-content: flex-end;
    }
    .btn {
      display: inline-block;
      background: var(--primary);
      color: white;
      padding: 0.6rem 1.25rem;
      border-radius: 6px;
      text-decoration: none;
      font-size: 1rem;
      border: none;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn:hover { background: var(--primary-hover); }
    .btn-secondary {
      background: #e2e8f0;
      color: var(--text);
    }
    .btn-secondary:hover { background: #cbd5e1; }
    @media (max-width: 768px) {
      .editor-wrapper { grid-template-columns: 1fr; }
      textarea, .preview-content { height: auto; min-height: 300px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>✏️ 编辑文档：${escapeHtml(id)}</h1>
      <a href="/admin" class="btn btn-secondary">← 返回管理</a>
    </header>
    <form method="POST" action="/doc" id="edit-form">
      <input type="hidden" name="id" value="${escapeHtml(id)}">
      <div class="editor-wrapper">
        <div class="editor-pane">
          <h2>Markdown 编辑器</h2>
          <textarea id="content" name="content" required>${escapeHtml(content)}</textarea>
        </div>
        <div class="preview-pane">
          <h2>实时预览</h2>
          <div id="preview" class="preview-content"></div>
        </div>
      </div>
      <div class="actions">
        <button type="submit" class="btn">💾 保存</button>
        <a href="/doc/${encodeURIComponent(id)}" class="btn btn-secondary">取消</a>
      </div>
    </form>
  </div>
  <script src="https://unpkg.com/marked@12.0.2/marked.min.js"></script>
<script>
  (function() {
    // 初始化 marked
    if (window.marked) {
      window.marked.setOptions({ gfm: true, breaks: false });
    }

    function updatePreview() {
      const input = document.getElementById('content');
      const preview = document.getElementById('preview');
      if (!input || !preview) return;
      const text = input.value;
      if (window.marked) {
        try {
          preview.innerHTML = window.marked.parse(text);
        } catch (err) {
          preview.textContent = '预览出错：' + err.message;
        }
      } else {
        // Fallback: 显示纯文本，同时提示加载失败
        preview.textContent = text;
        preview.style.color = '#999';
        preview.innerHTML = '<p style="color:red;">Markdown 解析库加载失败，请检查网络后刷新页面。</p><pre>' + escapeHtml(text) + '</pre>';
      }
    }

    // 绑定输入事件
    const textarea = document.getElementById('content');
    if (textarea) {
      textarea.addEventListener('input', updatePreview);
    }

    // 初始渲染
    updatePreview();
  })();
</script>
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
