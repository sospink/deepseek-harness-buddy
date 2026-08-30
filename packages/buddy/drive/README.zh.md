---
description: "Buddy 文档云盘的提供方无关 Service：资料库、文件夹、文件、不可变版本、审计、限制和校验读取契约。"
kind: "package-reference"
---

# @sospink/dsh-buddy-drive

[English](README.md) | 中文

## 概述

`@sospink/dsh-buddy-drive` 是 Buddy 资料云盘能力的 Service Definition。它拥有提供方无关的词汇和 `ctx.drive` 契约，包括一个资料库、无环文件夹树、逻辑文件、不可变版本、修改审计、准入限制和经过校验的版本读取。它不执行 IO，也不选择文件系统、数据库、对象存储、HTTP 传输、浏览器预览、Agent 工具、留存周期、身份模型或分享策略。

## 目录

- [使用本包](#use-this-package)
- [实现说明](#understand-the-implementation)
- [进一步阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

## 使用本包

Consumer 注入 `drive` 并且只通过 `ctx.drive` 操作，不能获得 Provider 路径或 Blob URL。第一版契约支持文件夹创建/重命名/移动、文件导入/新增版本/重命名/移动、软删除/恢复、稳定列表、版本历史、近期审计读取和不可变内容校验读取。

一个逻辑文件拥有稳定的 `DriveFileId`；每次被接受的内容修改都会创建新的 `DriveVersionId` 并推进 `currentVersionId`。`DriveDigest` 是 SHA-256 内容身份，不是 Bearer Capability。`ImportDriveFileInput.idempotencyKey` 是新文件导入可选的、由调用方持有的稳定 Key：Provider 可以为相同请求重放首次提交的文件；同一 Key 对应不同请求时必须拒绝并报告冲突。`DriveMutationContext` 携带可信操作者归属和可选关联 id；缺失的关联 id 由 Provider 生成。

### 错误处理

Provider 抛出带稳定 `DriveErrorCode` 的 `DriveError`。调用方按 `code` 分支，不能依赖诊断文本。业务对象缺失、重名、幂等冲突、非法移动、配额、格式不支持和持久化完整性失败保持不同错误。

## 实现说明

本包由类型和一个抽象 Cordis `Service` 组成。ID Factory 是零开销字符串 Brand。Service Method 不暴露 Host 路径、可变 Provider Entity 或传输特定值。返回数组和快照是 Provider 所有的不可变投影；Provider 必须在异步队列观察调用方二进制输入前完成复制。

## 进一步阅读

- [本地 Provider](../drive-local/README.zh.md)——第一套持久化元数据和 Blob 实现。
- [Buddy 包地图](../README.zh.md)——分支自有包 Scope 和仓库位置。
- [定位安全 Agent 云盘提案](../../../.agents/notes/proposed/feature/2026-08-29-safety-agent-drive-library.zh.md)——被拒方案、安全策略和交付阶段。

## 模型体验

### 云盘状态与内容

#### 模型看到什么

本包不直接向模型提供任何内容。`ctx.drive` 不注册 Prompt 或 Tool；后续 Consumer 可以暴露有界的 `drive_list`、`drive_search` 或 `drive_read` 结果，并携带文件和版本来源。

#### Token 影响

直接 Token 为零。所有从 `DriveFile`、`DriveVersion` 或文档内容派生的 Token 均由面向模型的 Consumer 负责。

#### KV Cache 影响

与请求独立：本 Service Definition 不改变模型请求前缀；后续 Consumer 对其 Schema 和 Result 引起的缓存影响负责。

## 已知限制与延期工作

- **第一版只有一个默认资料库**——词汇包含 `DriveLibraryId`，但第一套 Provider 只暴露一个资料库，没有创建/删除资料库操作。
- **Seam 暂无授权主体**——本地回环产品只有一个可信人类上下文；网络和多用户 Provider 在使用前必须增加经过评审的身份与授权扩展。
- **没有预览或搜索 API**——浏览器预览、提取文本、全文索引和 RAG 属于独立 Consumer 或 Provider，必须保留文件/版本删除与授权语义。
- **没有硬删除操作**——公开面只有软删除/恢复；留存和垃圾回收属于 Provider 策略，普通调用方不能删除被共享的不可变版本。

### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

API 有意把 Agent 发布保留为带 `source: 'agent-publication'` 的 `createVersion`。第一版 Agent Consumer 是只读的，在具备人类审批语义前不得暴露该操作。

</details>
