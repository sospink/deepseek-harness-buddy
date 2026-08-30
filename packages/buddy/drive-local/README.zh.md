---
description: "Buddy Drive 本地 Provider：原子元数据、私有内容寻址 Blob、Markdown/PDF/DOCX 准入、配额、审计、重启校验和孤儿回收。"
kind: "package-reference"
---

# @sospink/dsh-buddy-drive-local

[English](README.md) | 中文

## 概述

`@sospink/dsh-buddy-drive-local` 在单个 Host 上实现 `ctx.drive`。它通过 `buddy_drive` Storage Domain Global 一次提交完整元数据关系，并把不可变源文件保存到私有 SHA-256 对象树。它在 Host 侧准入 Markdown、PDF 和 DOCX，执行配额、同级名称和文件夹树不变量，记录修改审计，按幂等 Key 持久化重放新文件导入，在启动时校验所有被引用 Blob，并删除临时或无引用的 Provider 自有对象。

## 目录

- [使用本包](#use-this-package)
- [实现说明](#understand-the-implementation)
- [进一步阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

## 使用本包

先挂载 Storage Hub 和 Domain Data Form，然后在所有 Agent Workspace 之外使用私有 Root 挂载 `LocalDriveStore`：

```yaml
- name: '@sospink/dsh-buddy-drive-local'
  config:
    root: /private/dsh-home/buddy-drive
```

配置包含编码文件字节、全部保留版本逻辑字节、DOCX 条目/解压字节/压缩比和最大审计数。默认值是单文件 50 MiB、保留逻辑字节 2 GiB、DOCX 2,000 个条目、DOCX 解压 250 MiB、压缩比 100、审计 100,000 条。

### 准入

名称只是展示用单路径段，最长 255 个 UTF-8 字节。可见文件夹和文件共享一套不区分大小写的同级命名空间。`.md`/`.markdown` 必须是有界有效 UTF-8，不能有 NUL 或二进制签名伪装。`.pdf` 必须包含合法 `%PDF-x.y` Header。`.docx` 必须是包含 `[Content_Types].xml` 和 `word/document.xml` 的 OOXML ZIP；危险成员路径、超量条目或解压、异常压缩比、VBA、AltChunk、外部关系和带宏内容全部拒绝。浏览器声明媒体类型只作提示，具体声明必须与实际格式一致。

### 提交与恢复

所有修改串行执行。Provider 复制调用方字节，校验并发布私有内容寻址对象，然后一次提交完整元数据状态。带幂等 Key 的新文件导入会把 Key 和规范请求摘要写入本地审计元数据；相同 Key 和摘要返回原文件，不再发布第二个文件，摘要不一致则明确报告冲突。元数据写入失败时，旧内存状态和旧持久化状态仍然权威；可能留下不可达对象，并在下次启动时删除。启动遇到被引用 Blob 缺失、损坏、符号链接、名称异常或权限异常时直接拒绝，不能把损坏误判为空云盘。

Blob 发布先写入并同步 Owner-only 临时 Inode，再使用硬链接把它独占发布到最终摘要路径，不替换已有条目，随后移除临时名称并同步所在目录。已有对象必须是非符号链接普通文件，且长度和摘要一致。

### 本地备份与恢复

Provider 在 `LocalDriveStore` 上提供显式维护方法：`createBackup(destination)`、`inspectBackup(source)` 和 `restoreBackup({ source, replace?, mutation? })`。这些方法有意不注册浏览器路由，只能由受信任的本地维护调用方使用。备份是一个新的 Owner-only 目录，包含 `manifest.json`、规范化的 `metadata.json`，以及 `blobs/sha256/<prefix>/<digest>` 下全部被引用的 Blob。

`createBackup` 先写入同级临时目录，完成整包校验后通过独占目录重命名发布，不覆盖已有目标。`inspectBackup` 只读检查格式/版本、规范化 JSON、元数据关系、配置限制、精确目录项、权限以及每个 Blob 的摘要和字节数。`restoreBackup` 默认拒绝恢复到非空资料库，只有显式传入 `replace: true` 才允许替换；完成校验后发布缺失对象，并在一次 Storage Domain 写入中提交备份元数据和一条 `library/restore` 审计事件。元数据写入失败时，原有元数据仍然是权威状态；新产生的不可达 Blob 会在下一次正常启动协调时被清理。

本备份是本地快照，不是加密托管或异地容灾。它不提供身份、分享、租户隔离、杀毒/CDR、留存调度或自动删除历史版本；留存和硬删除策略等待部署协议明确后再实现。

## 实现说明

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | Service 生命周期、元数据操作、原子状态提交、配额、审计、幂等导入和图校验 |
| [`src/spec.ts`](src/spec.ts) | Zod 持久化状态和 `buddy_drive` Domain 声明 |
| [`src/admission.ts`](src/admission.ts) | 名称/标签规范化及 Markdown/PDF/DOCX 权威准入 |
| [`src/blob.ts`](src/blob.ts) | 私有内容寻址发布、读取、校验、启动协调和可注入文件系统故障边界 |
| [`src/backup.ts`](src/backup.ts) | 版本化本地备份格式、完整性校验、独占创建、恢复暂存和恢复审计构造 |
| [`src/state.ts`](src/state.ts) | Cordis-free 完整元数据关系校验，由启动和每次提交共用 |
| [`src/ordering.ts`](src/ordering.ts) | 稳定的名称/id 与时间/id 投影排序 |
| [`src/invariant.ts`](src/invariant.ts) | Package Invariant 所有权；完整状态校验由 Provider 执行 |

## 进一步阅读

- [Drive Service Definition](../drive/README.zh.md)——提供方无关公开契约。
- [Buddy 包地图](../README.zh.md)——分支自有包家族。
- [定位安全 Agent 云盘提案](../../../.agents/notes/proposed/feature/2026-08-29-safety-agent-drive-library.zh.md)——产品/安全理由和后续 UI/预览阶段。

## 模型体验

### 本地云盘状态与源文件

#### 模型看到什么

本 Provider 不直接向模型提供内容。它不注册 Prompt 或 Tool，只向显式 `ctx.drive.readVersion` 调用方返回源字节；后续 Tool Consumer 必须限制并标注所有模型可见投影。

#### Token 影响

直接 Token 为零。本地元数据和 Blob 不会自行进入模型请求。

#### KV Cache 影响

与请求独立：元数据提交和 Blob 发布不改变请求前缀；后续面向模型的 Consumer 对失效影响负责。

## 已知限制与延期工作

- **单进程元数据权威**——Storage Domain Change Event 只在进程内可见；两个 Host 不能同时打开同一个本地 Root。
- **逻辑字节配额统计每个版本**——相同摘要共享磁盘字节，但每个不可变版本都计入保留逻辑字节，防止去重绕过策略。
- **软删除版本继续保留**——第一版 Provider 提供恢复和启动孤儿清理，不提供按留存窗口执行硬删除的 Scheduler。
- **DOCX 准入是结构检查，不是病毒扫描**——VBA、AltChunk、外部关系、解压攻击和常见伪装会被拒绝，但杀毒/CDR 属于后续 Provider Seam。
- **POSIX Owner 检查是本地用户检查**——Windows 会检查普通文件和非符号链接，但暂未执行等价 ACL 契约。

### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

完整元数据文档有意优先保证原子性和明确恢复，而不是大规模资料库性能。在拆分成多表前，必须先引入 Storage Transaction Contract，并证明文件/版本/审计关系不会部分提交。

</details>
