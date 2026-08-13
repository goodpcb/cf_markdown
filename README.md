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
