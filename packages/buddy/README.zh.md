---
description: "Buddy 分支自有产品能力的包地图：在不占用上游命名空间的情况下扩展 DeepSeek Harness。"
kind: "package-group"
---

# buddy/——Buddy 分支自有产品能力

[English](README.md) | 中文

## 摘要

`buddy/` 组包含 `sospink/deepseek-harness-buddy` 分支私有包。这些包通过已有 Cordis Service 和少量组合接入点扩展上游 Harness，不占用 `@deepseek-ai` 命名空间，也不加入上游发布家族。当前产品层包含独立资料云盘，以及由受控工具调用驱动的智御全城 AI 原型画布。

尚未确认当前欢迎页版本的浏览器会在首次空白会话前显示单视口全屏视频欢迎页；用户点击“开始使用”后，原有侧边栏、工作区选择和常驻输入框恢复，并持久记录该确认，使后续刷新直接返回工作区。已有会话、轨迹和原型画布不受该欢迎层影响。

## 包列表

| 包 | 职责 | ctx key |
|---|---|---|
| [`drive/`](drive/README.zh.md) | 提供方无关的资料库、文件夹、文件、版本、审计和内容读取契约 | `ctx.drive` |
| [`drive-local/`](drive-local/README.zh.md) | 本地原子元数据和内容寻址 Blob Provider | 注册到 `ctx.drive` |
| [`api-drive/`](api-drive/README.zh.md) | 生成式 Remote 元数据命令、认证上传/内容路由和离线原型资源路由 | `ctx.buddyDriveController`、`ctx.remote.drive` |
| [`client-ui-drive/`](client-ui-drive/README.zh.md) | 独立云盘工作区，以及可缩放、平移并直接编辑 HTML 元素的原型 Conversation View | `ctx.buddyDriveUi` |
| [`drive-app/`](drive-app/README.zh.md) | 挂载完整 Drive 栈的可选 Web Bundle | Patch 层 |
| [`tool-drive/`](tool-drive/README.zh.md) | 只读 Drive 工具、受控原型生成/修改工具和定位安全 Agent Preset | Scoped `ctx.tools` Consumer |
| [`agent-role/`](agent-role/README.zh.md) | 可持久化的专业身份目录、会话事件、Projection 与模型上下文 | `ctx.agentRoles` |
| [`client-ui-agent-role/`](client-ui-agent-role/README.zh.md) | 空白会话中的分组专业身份选择器 | `conversation.hero.agentRole` |
| [`development-management/`](development-management/README.zh.md) | 持久化角色流程、流式工程附件、真实 Git 交付审查和 MR 门槛 | `ctx.developmentManagement` |
| [`client-ui-development-management/`](client-ui-development-management/README.zh.md) | 深色亚克力“开发管理”侧栏工作区 | `sidebar.footer.action`、`shell.overlay` |

## 相关文档

- [Buddy Drive 子系统](../../docs/subsystems/buddy-drive.zh.md)——Provider、浏览器适配器和只读模型 Consumer 的边界。
- [定位安全 Agent 云盘提案](../../.agents/notes/proposed/feature/2026-08-29-safety-agent-drive-library.zh.md)——能力边界、预览方案、安全策略和阶段交付。
- [开发 TODO](../../BUDDY_DRIVE_TODO.md)——需求台账、验收证据和当前实现状态。
- [开发管理验收台账](../../docs/buddy-development-management-ledger.zh.md)——角色、上传、Git 审查与合并证据。

### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

在独立发布和兼容性策略通过评审前，分支自有包都是私有 Workspace Member。不得把它们改名到 `@deepseek-ai` 命名空间。

</details>
