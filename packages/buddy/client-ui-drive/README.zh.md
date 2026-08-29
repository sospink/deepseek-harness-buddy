---
description: "独立 Buddy Drive 浏览器工作区：生成式 Remote 挂载、重连状态、上传、侧栏入口、资料管理和详情 Surface。"
kind: "package-reference"
---

# @sospink/dsh-buddy-client-ui-drive

[English](README.md) | 中文

## 摘要

`@sospink/dsh-buddy-client-ui-drive` 是 Buddy Drive 的浏览器应用界面。它把生成的 `drive` Remote Contribution 挂载到 `ctx.remote`，跟随完整重连 Snapshot，提供 React-free 的 `ctx.buddyDriveUi` 状态与命令 Service，在 `sidebar.footer.action` 注册资料云盘入口，并在 `shell.overlay` 渲染独立三栏工作区。所有写入和上传都调用真实 Host API；UI 不包含演示数据或固定成功路径。

## 使用本包

在 API Gateway、Connection、Locale、Layout、Sidebar 和 UI Renderer 之后，与原生 Web Client Module 一起挂载。Client Module 自行挂载 `@sospink/dsh-buddy-api-drive/remote`，因此分支无需修改上游 `api-remotes` Assembly。

侧栏操作会打开云盘，并在关闭时恢复焦点。应用工作区包含文件夹导航、搜索和上传控件、文件列表以及文件详情/操作。用户可以创建文件夹、上传 Markdown/PDF/DOCX 文档、选择上传分类、搜索当前文件夹、显示已删除文件、更新分类、下载原文件、软删除和恢复。

Markdown 文件已经具备真实的渲染/源码预览，内容来自不可变 Content Route，并复用 Harness `MarkdownText`。浏览器最多保留 2 MiB；文件选择变化时取消旧读取；进入渲染器前会转义已解析的图片标记，避免文档内 HTTP(S) 图片发起请求。原始 HTML 在 Harness 渲染器中保持字面文本。

PDF 文件使用真实 PDF.js Canvas Viewer，后端为不可变 Range Route、固定版本同源 Worker 和认证 Packed CMap。Viewer 只保留当前一页，支持上一页/下一页、50%–200% 缩放，以及最多跨 500 页的显式文本搜索。Annotation Render Layer 和 Scripting Layer 均不挂载。文档/页面 JavaScript Action 只用于显示“已阻止”提示；绝对 HTTP(S) Annotation 会转成独立的显式点击链接，危险协议不会出现在界面中。DOCX 详情仍明确显示对应预览切片尚未实现。

## 实现说明

| 文件 | 职责 |
|---|---|
| [`src/client/service.ts`](src/client/service.ts) | Remote Mount Consumer、重连 Snapshot Model、上传和元数据操作、焦点恢复、内容 URL |
| [`src/client/index.ts`](src/client/index.ts) | Client Module 生命周期、Remote Contribution Mount、字典与 Slot 注册 |
| [`src/client/DriveTrigger.tsx`](src/client/DriveTrigger.tsx) | 宽侧栏/轨道入口 |
| [`src/client/DriveOverlay.tsx`](src/client/DriveOverlay.tsx) | 三栏文件管理工作区与按格式分派的预览位置 |
| [`src/client/MarkdownPreview.tsx`](src/client/MarkdownPreview.tsx) | Markdown 渲染/源码 UI、取消、重试以及 Harness `MarkdownText` 组合 |
| [`src/client/markdown-preview.ts`](src/client/markdown-preview.ts) | 有界 UTF-8 读取和基于解析结果的图片标记去激活 |
| [`src/client/PdfPreview.tsx`](src/client/PdfPreview.tsx) | 单页 Canvas Viewer、导航、缩放、搜索、脚本提示和显式链接 |
| [`src/client/pdf-preview.ts`](src/client/pdf-preview.ts) | PDF 预算、Range 选项、文本搜索、Canvas 尺寸和 Annotation URL 策略 |
| [`src/client/pdf-runtime.ts`](src/client/pdf-runtime.ts) | 延迟 PDF.js Runtime 边界 |
| [`src/client/locales.ts`](src/client/locales.ts) | 类型化中英文产品文案 |

## 进一步阅读

- [Buddy Drive 浏览器 API](../api-drive/README.zh.md)——生成式 Remote 和认证上传/内容路由。
- [Buddy Drive Bundle](../drive-app/README.zh.md)——可选 Web Profile 组合。
- [开发 TODO](../../../BUDDY_DRIVE_TODO.md)——验收状态和预览工作。

## 模型体验

### 云盘浏览器状态

#### 模型看到什么

本包不向模型提供内容，只通过 `ctx.buddyDriveUi` 挂载浏览器状态和用户操作，不贡献 Prompt、Tool Schema 或 Session Event。

#### Token 影响

直接 Token 为零。

#### KV Cache 影响

与模型请求独立；浏览器资料管理不会改变请求前缀。

## 已知限制与延期工作

- **DOCX 仍是明确占位**：Markdown 与 PDF 预览已经实现；隔离 DOCX 渲染仍属于后续切片，原文件始终可下载。
- **PDF 搜索以页面为单位**：一次搜索最多检查 500 页并跳到第一处匹配页面；当前不绘制匹配高亮，也不暴露 Text Layer。
- **PDF 页面虚拟化为单页驻留**：只保留当前 Canvas 页面。缩略图栏、连续滚动、打印、表单、附件、Outline 和内部 Destination 仍延期。
- **PDF Client Bundle 成本**：为避免 Harness 不支持的动态 Chunk，PDF.js 被内联到 Loader 拥有的唯一 `client.js`；当前未压缩 Buddy Client Artifact 约 1.38 MiB。
- **Markdown 预览预算**：浏览器最多渲染一个不可变 Markdown 版本的 2 MiB 内容。更大的文档仍可下载，不进行不完整渲染。
- **远程 Markdown 图片不激活**：已解析的行内/引用图片会显示为惰性 Markdown 文本；当前尚无按文档配置的图片白名单。
- **只搜索当前文件夹**：搜索框在内存中过滤选中目录；跨目录和内容索引搜索属于后续工作。
- **多文件顺序上传**：选择的文件逐个上传，以保持顺序和错误语义简单；带有界并发的进度队列后续完善。
- **窄屏隐藏详情栏**：低于 900px 时隐藏详情列；专用移动端文件/详情导航仍延期。

### 开发备注

<details><summary>维护者工作上下文——点击展开</summary>

预览实现应放在按文件媒体类型划分的 Renderer 后方，不要在导航和列表组件中散布格式条件分支。格式 Renderer 在进入详情区前必须拥有完整的字节/时间预算、取消机制和外部资源策略。

</details>
