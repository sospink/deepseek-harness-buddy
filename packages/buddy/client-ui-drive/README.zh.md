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

侧栏操作会打开云盘，并在关闭时恢复焦点。应用工作区包含文件夹导航、搜索和上传控制、文件列表以及文件详情/操作。用户可以创建文件夹，上传 Markdown/PDF/DOCX，选择上传分类，搜索当前文件夹，显示已删除文件，更新分类，下载原件，软删除和恢复。

详情栏会明确提示在线预览属于下一阶段。它不会渲染假预览，也不会声称文件已经完成转换。

## 实现说明

| 文件 | 职责 |
|---|---|
| [`src/client/service.ts`](src/client/service.ts) | Remote Mount Consumer、重连 Snapshot Model、上传和元数据操作、焦点恢复、内容 URL |
| [`src/client/index.ts`](src/client/index.ts) | Client Module 生命周期、Remote Contribution Mount、字典与 Slot 注册 |
| [`src/client/DriveTrigger.tsx`](src/client/DriveTrigger.tsx) | 宽侧栏/轨道入口 |
| [`src/client/DriveOverlay.tsx`](src/client/DriveOverlay.tsx) | 三栏资料管理工作区和明确的待预览详情区 |
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

- **预览占位明确可见**——本版本尚未实现 Markdown/PDF/DOCX 在线渲染；用户可以下载原文件。
- **只搜索当前文件夹**——搜索框在内存中过滤选中目录；跨目录和内容索引搜索属于后续工作。
- **多文件顺序上传**——选择的文件逐个上传，以保持顺序和错误语义简单；带有界并发的进度队列后续完善。
- **窄屏隐藏详情栏**——低于 900px 时隐藏详情列；专用移动端文件/详情导航仍延期。

### 开发备注

<details><summary>维护者工作上下文——点击展开</summary>

预览实现应放在文件媒体 Renderer 后面，不要把格式条件扩散到导航和列表组件。

</details>
