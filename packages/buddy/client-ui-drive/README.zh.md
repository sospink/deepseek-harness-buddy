---
description: "独立 Buddy Drive 浏览器工作区：生成式 Remote 挂载、重连状态、有界上传队列、侧栏入口、资料管理和详情 Surface。"
kind: "package-reference"
---

# @sospink/dsh-buddy-client-ui-drive

[English](README.md) | 中文

## 概述

`@sospink/dsh-buddy-client-ui-drive` 是 Buddy Drive 的浏览器应用界面。它把生成的 `drive` Remote Contribution 挂载到 `ctx.remote`，跟随完整重连 Snapshot，提供 React-free 的 `ctx.buddyDriveUi` 状态与命令 Service，在 `sidebar.footer.action` 注册资料云盘入口，并在 `shell.overlay` 渲染独立三栏工作区。所有写入和上传都调用真实 Host API；UI 不包含演示数据或固定成功路径。

## 目录

- [使用本包](#use-this-package)
- [实现说明](#understand-the-implementation)
- [进一步阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

## 使用本包

在 API Gateway、Connection、Locale、Layout、Sidebar 和 UI Renderer 之后，与原生 Web Client Module 一起挂载。Client Module 自行挂载 `@sospink/dsh-buddy-api-drive/remote`，因此分支无需修改上游 `api-remotes` Assembly。

侧栏操作会打开云盘，并在关闭时恢复焦点。应用工作区包含文件夹导航、搜索和上传控件、文件列表以及文件详情/操作。用户可以创建文件夹、选择上传分类，把最多 100 个 Markdown/PDF/DOCX 文件加入有界队列，查看单项和总体进度，取消排队或正在上传的任务，重试失败/取消任务，清理已完成/已取消行，搜索当前文件夹、显示已删除文件、更新分类、下载原文件、软删除和恢复。最多同时上传两个文件；单项失败不会阻塞后续队列项。

每个队列项在其生命周期内拥有一个稳定的 Upload ID。Client 通过 `X-Buddy-Drive-Upload-Id` 发送它，因此传输中止后的重试可以重放 Host 提交而不会创建重复文件。Host 返回 `201` 后即使后续元数据刷新失败，该项仍保持成功；刷新错误会单独报告。

Markdown 文件已经具备真实的渲染/源码预览，内容来自不可变 Content Route，并复用 Harness `MarkdownText`。源码模式最多保留 2 MiB；富文本渲染另行限制为最多 256 KiB/4,000 行的 UTF-8 前缀，避免长文档产生无界 Markdown AST/DOM。文件选择变化时取消旧读取；进入渲染器前会转义已解析的图片标记，避免文档内 HTTP(S) 图片发起请求。原始 HTML 在 Harness 渲染器中保持字面文本。

PDF 文件使用真实 PDF.js Canvas Viewer，后端为不可变 Range Route、固定版本同源 Worker 和认证 Packed CMap。Viewer 只保留当前一页，支持上一页/下一页、50%–200% 缩放，以及最多跨 500 页的显式文本搜索。Annotation Render Layer 和 Scripting Layer 均不挂载。文档/页面 JavaScript Action 只用于显示“已阻止”提示；绝对 HTTP(S) Annotation 会转成独立的显式点击链接，危险协议不会出现在界面中。DOCX 文件采用双边界预览。专用 Worker 使用 20 MiB 编码预算、1,000 条目上限、64 MiB 解压预算、100:1 压缩比上限和 10 秒超时重新检查 OOXML ZIP。只有转移后的安全 Buffer 会进入不含 `allow-same-origin` 的 `sandbox="allow-scripts"` iframe；其 CSP 禁止网络、表单、Object、子 Frame 和导航。固定版本 `docx-preview` 在其中以 `renderAltChunks:false` 和 Base64 资源完成排版，iframe 会清除主动元素/属性、把固定 Word 纸张自动适配详情栏宽度，并且只向父页面发送 boot/ready/failure 和页数。

独立工作区使用原生文件输入，并在关闭后把焦点还给入口。Modal 打开后聚焦上传按钮，限制正向/反向 Tab 遍历；在 390 px 视口下仍可访问文件夹、文件列表、预览/详情和原文件下载，且页面没有横向溢出。

## 实现说明

| 文件 | 职责 |
|---|---|
| [`src/client/service.ts`](src/client/service.ts) | Remote Mount Consumer、重连 Snapshot Model、上传和元数据操作、焦点恢复、内容 URL |
| [`src/client/upload.ts`](src/client/upload.ts) | 同源 XHR 上传传输、有界进度、超时和取消 |
| [`src/client/UploadQueue.tsx`](src/client/UploadQueue.tsx) | 有界队列投影、进度摘要、取消、重试和清理控件 |
| [`src/client/index.ts`](src/client/index.ts) | Client Module 生命周期、Remote Contribution Mount、字典与 Slot 注册 |
| [`src/client/DriveTrigger.tsx`](src/client/DriveTrigger.tsx) | 宽侧栏/轨道入口 |
| [`src/client/DriveOverlay.tsx`](src/client/DriveOverlay.tsx) | 三栏文件管理工作区与按格式分派的预览位置 |
| [`src/client/MarkdownPreview.tsx`](src/client/MarkdownPreview.tsx) | Markdown 渲染/源码 UI、取消、重试以及 Harness `MarkdownText` 组合 |
| [`src/client/markdown-preview.ts`](src/client/markdown-preview.ts) | 有界 UTF-8 读取和基于解析结果的图片标记去激活 |
| [`src/client/PdfPreview.tsx`](src/client/PdfPreview.tsx) | 单页 Canvas Viewer、导航、缩放、搜索、脚本提示和显式链接 |
| [`src/client/pdf-preview.ts`](src/client/pdf-preview.ts) | PDF 预算、Range 选项、文本搜索、Canvas 尺寸和 Annotation URL 策略 |
| [`src/client/pdf-runtime.ts`](src/client/pdf-runtime.ts) | 延迟 PDF.js Runtime 边界 |
| [`src/client/DocxPreview.tsx`](src/client/DocxPreview.tsx) | 有界下载、Worker 预检、opaque iframe 生命周期、超时和状态 UI |
| [`src/client/docx-preview.ts`](src/client/docx-preview.ts) | Worker/Frame 协议、预算、CSP srcdoc、Sanitizer 和响应式纸张适配 |
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

- **DOCX 保真由浏览器渲染器决定**：`docx-preview` 可保留常见分页、表格、图片、页眉页脚和样式，但不等同于 Microsoft Word；复杂 Field、修订、评论、Shape 和字体可能存在差异。
- **DOCX 不向父页面暴露正文/搜索 Surface**：opaque iframe 有意阻止父页面读取 Word DOM 和文本。语义提取/搜索仍延期，必须使用独立有界且经过清洗的 Worker Pipeline。
- **DOCX 预览预算严于存储准入**：浏览器将编码 DOCX 限制为 20 MiB、解压内容限制为 64 MiB，即使 Host 存储接受更大的文件；超限原文件仍可下载。
- **PDF 搜索以页面为单位**：一次搜索最多检查 500 页并跳到第一处匹配页面；当前不绘制匹配高亮，也不暴露 Text Layer。
- **原生 Safari 自动化仍受环境开关约束**：Chromium 和 Playwright WebKit 26.5 已通过同一套预览验收；Safari 26.3.1 仍需先启用“允许远程自动化”，`safaridriver` 才能提供原生 Safari 证据。
- **PDF 页面虚拟化为单页驻留**：只保留当前 Canvas 页面。缩略图栏、连续滚动、打印、表单、附件、Outline 和内部 Destination 仍延期。
- **PDF Client Bundle 成本**：为避免 Harness 不支持的动态 Chunk，PDF.js 被内联到 Loader 拥有的唯一 `client.js`；当前未压缩 Buddy Client Artifact 约 1.40 MB。
- **Markdown 预览预算**：源码模式最多保留一个不可变版本的 2 MiB 内容；富文本只使用 256 KiB/4,000 行前缀并明确提示截断。更大的原文件仍可下载。
- **远程 Markdown 图片不激活**：已解析的行内/引用图片会显示为惰性 Markdown 文本；当前尚无按文档配置的图片白名单。
- **只搜索当前文件夹**：搜索框在内存中过滤选中目录；跨目录和内容索引搜索属于后续工作。
- **有界上传队列**：浏览器最多保留 100 行，最多同时发送两个请求。队列状态有意只存在于当前页面；刷新不会恢复进行中的文件，但 Host 幂等语义会避免已到达服务端的提交在重试时重复创建。
- **窄屏使用纵向堆叠导航**：低于 900px 时文件夹、文件列表和详情纵向排列；专用的移动端文件/详情路由与历史记录模型仍延期。

### 开发备注

<details><summary>维护者工作上下文——点击展开</summary>

预览实现应放在按文件媒体类型划分的 Renderer 后方，不要在导航和列表组件中散布格式条件分支。格式 Renderer 在进入详情区前必须拥有完整的字节/时间预算、取消机制和外部资源策略。

</details>
