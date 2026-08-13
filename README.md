# Markdown Worker

一个基于 Cloudflare Workers 的轻量级 Markdown 文档管理服务。支持文档的创建、编辑、实时预览、下载、导出 HTML、打印以及文件夹（前缀）管理。利用 Cloudflare D1 存储 Markdown 原文，利用 KV 缓存渲染后的 HTML 加速访问。

## 功能特性

- **文档管理**：新建、查看、编辑、删除文档。
- **文件夹支持**：通过文档 ID 前缀（如 `docs/guide`）实现虚拟文件夹，支持删除整个文件夹。
- **实时预览**：编辑时左侧预览、右侧编辑，实时渲染 Markdown。
- **导出功能**：
  - 下载原始 Markdown 文件。
  - 导出为 HTML 文件。
  - 打印 / 导出为 PDF。
- **权限控制**：管理员登录（密码通过环境变量设置），未登录用户只能查看和下载。
- **响应式设计**：适配桌面和移动设备。
- **缓存加速**：未登录用户访问的渲染结果缓存至 KV（TTL 1 小时），提升性能。

## 快速开始

### 前提条件

- 一个 [Cloudflare](https://cloudflare.com) 账户。
- 一个 GitHub 账号（用于连接 Git 部署）。
- 一个包含本仓库代码的 GitHub 仓库（建议私有）。

### 第一步：创建 D1 数据库并建表

1. 登录 Cloudflare Dashboard，进入 **Workers & Pages** → **D1**。
2. 点击 **创建数据库**，命名为 `markdown-db`。
3. 创建完成后，点击数据库名称进入详情页，选择 **控制台** 标签。
4. 执行以下 SQL 创建表：
   ```sql
   CREATE TABLE IF NOT EXISTS documents (
     id TEXT PRIMARY KEY,
     content TEXT NOT NULL
   );
5. 记录数据库的 **ID**（在详情页顶部），稍后绑定使用。

### 第二步：创建 KV 命名空间

1. 在 Cloudflare Dashboard 左侧进入 **Workers & Pages** → **KV**。
2. 点击 **创建命名空间**，命名为 `MARKDOWN_CACHE`。
3. 记录命名空间的 **ID**。

### 第三步：创建 Worker 并连接 GitHub

1. 进入 **Workers & Pages**，点击 **创建应用程序**。
2. **选择 “Workers” 标签页**（不是 Pages），点击 **连接到 Git**。
3. 授权 Cloudflare 访问你的 GitHub 账户，并选择包含本代码的仓库。
4. 在构建设置中：
   - **构建命令**：填写 `npm install`（或留空，系统会自动执行 `npm install`）。
   - **部署命令**：**留空**（Worker 类型会自动部署 `_worker.js`）。
5. 点击 **保存并部署**。

### 第四步：配置绑定和环境变量

1. 进入刚创建的 Worker 项目，点击 **设置** → **变量**。
2. 在 **环境变量** 部分添加：
   - 名称：`ADMIN_PASSWORD`，值：设置你的管理员密码。
3. 在 **绑定** 部分添加：
   - **D1 数据库绑定**：变量名 `DB`，选择 `markdown-db`。
   - **KV 命名空间绑定**：变量名 `KV`，选择 `MARKDOWN_CACHE`。
4. 保存设置。

> **注意**：如果界面中绑定位置分散（如独立的 D1 和 KV 标签），请分别添加，确保变量名与代码中一致（`DB` 和 `KV`）。

### 第五步：测试

- 访问 Worker 的 `*.workers.dev` 域名，应看到欢迎页。
- 点击 **管理员登录**，输入设置的密码。
- 登录后进入管理面板，可以新建、编辑、删除文档，或删除文件夹。

## 使用说明

### 新建文档

- 在管理面板的“新建文档”区域输入文档 ID（可包含斜杠，如 `docs/guide/intro`），点击 **新建**。
- 系统会创建一个空文档并跳转到编辑页面。

### 编辑与实时预览

- 在编辑页面，左侧实时渲染 Markdown 预览，右侧为编辑器。
- 输入内容时，左侧预览会实时更新。
- 编辑完成后点击 **保存**，将跳转到查看页面（如果内容非空）；若内容为空，则保留在编辑页。

### 查看与导出

- 在查看页面，顶部操作栏提供：
  - **返回列表/首页**：根据登录状态返回管理面板或欢迎页。
  - **编辑**（仅登录时可见）：跳转到编辑页面。
  - **下载 Markdown**：下载原始 `.md` 文件。
  - **导出 HTML**：生成包含内联样式的独立 HTML 文件并下载。
  - **打印 / PDF**：调用浏览器打印功能，可另存为 PDF。

### 文件夹管理

- 文件夹通过文档 ID 前缀实现。例如 ID 为 `docs/guide` 的文档属于 `docs/` 文件夹。
- 在管理面板的“删除文件夹”区域，输入文件夹前缀（如 `docs/`），点击删除即可移除该前缀下的所有文档。
- 删除操作会同时清除相关 KV 缓存。

## 项目结构

```
.
├── _worker.js          # Cloudflare Worker 主文件
├── package.json        # 依赖定义（包含 marked）
└── README.md           # 本说明文件
```

## 环境变量与绑定

| 名称 | 类型 | 说明 |
|------|------|------|
| `ADMIN_PASSWORD` | 环境变量 | 管理员登录密码 |
| `DB` | D1 数据库绑定 | 存储文档内容 |
| `KV` | KV 命名空间绑定 | 缓存渲染后的 HTML |

## 常见问题

**Q：部署时提示 `Could not detect a directory containing static files`**  
A：请确认创建的是 **Worker** 类型项目，而非 Pages。如果已是 Worker 类型，可尝试在仓库根目录添加 `wrangler.toml` 文件，内容包含：
```toml
name = "markdown-worker"
main = "_worker.js"
compatibility_date = "2024-01-01"
```

**Q：登录提示密码错误**  
A：检查环境变量 `ADMIN_PASSWORD` 是否设置正确，注意大小写和前后空格。修改环境变量后可能需要重新部署或等待生效。

**Q：保存文档时出现 `Unable to parse URL`**  
A：请确保代码已更新为使用绝对 URL 重定向（`new URL(path, request.url).toString()`）。

**Q：实时预览不显示**  
A：确认浏览器能访问 `unpkg.com`，或尝试更换 CDN。如果无法访问，可以下载 `marked.min.js` 并作为静态文件托管（需将 Worker 改为 Pages 或使用其他方式）。
