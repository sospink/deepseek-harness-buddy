---
description: "Buddy 分支自有产品能力的包地图：在不占用上游命名空间的情况下扩展 DeepSeek Harness。"
kind: "package-group"
---

# buddy/——Buddy 分支自有产品能力

[English](README.md) | 中文

## 摘要

`buddy/` 组包含 `sospink/deepseek-harness-buddy` 分支私有包。这些包通过已有 Cordis Service 和少量组合接入点扩展上游 Harness，不占用 `@deepseek-ai` 命名空间，也不加入上游发布家族。第一项能力是“定位安全 Agent”产品模式使用的独立资料云盘。

## 包列表

| 包 | 职责 | ctx key |
|---|---|---|
| [`drive/`](drive/README.zh.md) | 提供方无关的资料库、文件夹、文件、版本、审计和内容读取契约 | `ctx.drive` |
| [`drive-local/`](drive-local/README.zh.md) | 本地原子元数据和内容寻址 Blob Provider | 注册到 `ctx.drive` |
| [`api-drive/`](api-drive/README.zh.md) | 生成式 Remote 元数据命令和认证上传/内容路由 | `ctx.buddyDriveController`、`ctx.remote.drive` |
| [`client-ui-drive/`](client-ui-drive/README.zh.md) | 独立侧栏/Overlay 云盘工作区和重连浏览器状态 | `ctx.buddyDriveUi` |
| [`drive-app/`](drive-app/README.zh.md) | 挂载完整 Drive 栈的可选 Web Bundle | Patch 层 |
| [`tool-drive/`](tool-drive/README.zh.md) | 只读 list/search/read 工具和定位安全 Agent Preset | Scoped `ctx.tools` Consumer |

## 相关文档

- [Buddy Drive 子系统](../../docs/subsystems/buddy-drive.zh.md)——Provider、浏览器适配器和只读模型 Consumer 的边界。
- [定位安全 Agent 云盘提案](../../.agents/notes/proposed/feature/2026-08-29-safety-agent-drive-library.zh.md)——能力边界、预览方案、安全策略和阶段交付。
- [开发 TODO](../../BUDDY_DRIVE_TODO.md)——需求台账、验收证据和当前实现状态。

### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

在独立发布和兼容性策略通过评审前，分支自有包都是私有 Workspace Member。不得把它们改名到 `@deepseek-ai` 命名空间。

</details>
