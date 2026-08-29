---
description: "Buddy Drive 浏览器 API：生成式 Remote 元数据命令、重连快照、认证原始上传和防御性 Range 内容响应。"
kind: "package-reference"
---

# @sospink/dsh-buddy-api-drive

[English](README.md) | 中文

## 摘要

`@sospink/dsh-buddy-api-drive` 是 `ctx.drive` 的 Host 浏览器 Adapter。它通过生成的 Typert Remote `drive` Namespace 暴露元数据命令和可重连完整快照流，并注册认证二进制路由，处理原始上传、不可变内容读取和固定版本 PDF.js 与 DOCX 预览资源。本包只拥有浏览器传输和失败映射；Drive Provider 仍然是准入、元数据、Blob、配额、审计和恢复的权威。

## 使用本包

在 Typert、Drive Provider、WebServer 和 Host Connection Service 之后挂载。Connection Service 提供 `/api` 使用的同一套 Host/Origin DNS Rebinding 防护和持久浏览器 Session 认证；所有 WebServer Route 都会在读取或返回字节前调用 `ctx.connection.requestRejection()`。

### Remote 元数据方法

生成的 `ctx.remote.drive` Namespace 提供 `baseline`、`createFolder`、`renameFolder`、`moveFolder`、`renameFile`、`moveFile`、`updateFileMetadata`、`deleteFile`、`restoreFile`、`versions`、`audit` 和流式 `follow`。每个 Follow Generation 先发送完整 Baseline，并在每次提交后的 `drive/changed` 事件发送完整 Snapshot，因此重连和漏帧恢复不需要 Client 回放 Diff。

### 上传路由

`POST /api/buddy-drive/upload` 接受 `application/octet-stream` Body，大小由 `ctx.drive.limits.maxFileBytes` 限制。新文件提供一个 `name`、一个 `kind`、可选 `parentId` 和重复 `tag` Query；新版本只能提供 `fileId`。可选 `X-Buddy-Drive-Media-Type` 只作提示，并且必须与 Host 准入一致。新文件导入还可以提供 `X-Buddy-Drive-Upload-Id`；该 Key 限制为最多 128 个 ASCII 标识符字符，并且会跨重试持久化。使用相同 Key 和相同规范请求摘要会重放原文件响应；相同 Key 用于不同输入时返回 `409 IDEMPOTENCY_CONFLICT`。版本上传不接受该 Key。路由不接受文件系统路径或 Base64 JSON Body。

### 内容路由

`GET|HEAD /api/buddy-drive/content/<versionId>` 返回一个经过校验的不可变版本。它支持一个标准字节范围（`start-end`、`start-` 或后缀），非法 Range 返回 `416` 和 `Content-Range: bytes */<size>`，并发送 `Accept-Ranges`、摘要 ETag、`nosniff`、private/no-store 缓存、UTF-8 Inline Disposition 和 Sandbox Content Security Policy。

### PDF.js 资源路由

`GET|HEAD /api/buddy-drive/assets/pdf.worker-6.2.108.mjs` 从已安装的 `pdfjs-dist` 包提供固定版本 PDF.js Worker。`GET|HEAD /api/buddy-drive/assets/cmaps/<name>.bcmap` 只提供该包 Packed CMap 目录中枚举到的文件名。两个 Surface 都要求认证、保持同源、使用 Immutable 缓存并设置 `nosniff`；未知文件、嵌套路径、Traversal 形式和不支持的方法都会被拒绝。PDF Runtime 和 CMap 均不从 CDN 获取。

### DOCX 预览资源路由

`GET|HEAD /api/buddy-drive/assets/docx-preflight-0.4.0.js` 提供自包含 JSZip Worker，重新检查 OOXML 结构、条目/解压字节/压缩比预算、不安全 Member Path、宏、AltChunk、嵌入包、DTD/Entity 和 External Relationship。`GET|HEAD /api/buddy-drive/assets/docx-runtime-0.4.0.js` 提供固定版本 JSZip 与 `docx-preview` UMD 字节，只在 opaque 预览 iframe 内执行。两个路由均要求认证、保持同源、使用 Immutable 缓存并设置 `nosniff`；浏览器不使用 CDN。

## 实现说明

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | Typert Remote Owner 和二进制路由注册生命周期 |
| [`src/commands.ts`](src/commands.ts) | Unary Command 投影和稳定 `TypertRemoteFailure` 映射 |
| [`src/feed.ts`](src/feed.ts) | 完整 Baseline 遍历和可重连 Snapshot Generation |
| [`src/http.ts`](src/http.ts) | 认证上传/内容/PDF 资源 Handler、Upload ID/Query 校验、Range 和防御响应头 |
| [`src/pdf-assets.ts`](src/pdf-assets.ts) | 固定 PDF Worker 字节和白名单 Packed CMap 查找/缓存 |
| [`src/docx-assets.ts`](src/docx-assets.ts) | 自包含 OOXML 预检 Worker 和仅供 iframe 使用的 DOCX Runtime 字节 |
| [`src/paths.ts`](src/paths.ts) | 浏览器安全的公开 HTTP 路由常量 |
| [`src/body.ts`](src/body.ts) | 精确有界原始 Request Body Intake |
| [`src/types.ts`](src/types.ts) | 浏览器安全的 Remote 与 HTTP Response 词汇 |

## 进一步阅读

- [Drive Service Definition](../drive/README.zh.md)——提供方无关实体与操作。
- [本地 Drive Provider](../drive-local/README.zh.md)——准入、元数据和 Blob 权威。
- [Buddy 包地图](../README.zh.md)——分支自有包家族。
- [开发 TODO](../../../BUDDY_DRIVE_TODO.md)——阶段验收和剩余 UI/预览工作。

## 模型体验

### 浏览器云盘传输

#### 模型看到什么

本包不向模型提供内容，只暴露浏览器 Remote 与 HTTP Surface，不注册模型 Tool 或 Prompt。后续 `drive_*` Tool Consumer 对任何模型可见文件元数据或提取内容负责。

#### Token 影响

直接 Token 为零。浏览器元数据 Snapshot 和二进制 Response 不会自行进入模型请求。

#### KV Cache 影响

与模型请求独立：Remote 调用和浏览器下载不会改变请求前缀。

## 已知限制与延期工作

- **每次修改发送完整 Snapshot**——第一版本地资料库有意优先简单和重连安全；大型多用户资料库需要 Revision Delta 或 Server Paging。
- **原始上传由 WebServer Route 缓冲**——路由执行 Drive 文件上限，但尚未直接流入 Provider Transaction；阶段 2 保留默认 50 MiB 上限。
- **不支持 Multi-range Response**——PDF 和普通浏览器读取支持一个字节范围；Multipart Range 返回 `416`。
- **固定 PDF.js 资源家族**——Worker 和 CMap 路径与 `pdfjs-dist@6.2.108` 耦合；依赖升级时必须更新带版本的 Worker Path，并重跑浏览器 Fixture。
- **固定 DOCX 资源家族**——Worker/Runtime 路径与 `docx-preview@0.4.0`、`jszip@3.10.1` 耦合；升级时必须重新审查仅用于 Worker 预览预算的 JSZip 私有元数据，并重跑恶意 OOXML Fixture。
- **仅本地浏览器认证**——Connection Authentication 保护本地 Web 应用；企业身份与逐文件授权属于阶段 5。

### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

上传使用 WebServer Exact Route，而不是 `connection.fetch`，因为当前 Exact Fetch Registry 只允许 `GET` 和 `HEAD`。它仍在读取 Body 前调用同一个 Connection Rejection Method。若 Connection 后续支持认证 POST Fetch Route，本 Adapter 可以在不改变公开路径的情况下迁移。

</details>
