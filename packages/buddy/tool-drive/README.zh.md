---
description: "只读 Buddy Drive 模型工具：有界 list/search/read、隔离 PDF/DOCX 提取、不可变来源和可回放证据边界。"
kind: "package-reference"
---

# @sospink/dsh-buddy-tool-drive

[English](README.md) | 中文

## 摘要

`@sospink/dsh-buddy-tool-drive` 是 `ctx.drive` 的可选模型侧 Consumer。它只注册 `drive_list`、`drive_search` 和 `drive_read`，增加 Prompt Injection 指引，并随包提供定位安全 Agent Preset；该 Preset 在 Scope 内通过继承工具拒绝策略挂载这些工具。本包不暴露修改工具，也不接受文件系统路径。

## 使用本包

只在 Agent Preset 内挂载主入口。`drive_list` 返回当前未删除元数据，不读取文档内容。`drive_search` 先搜索元数据，再检查有界数量的当前不可变版本。`drive_read` 必须接收 list/search 返回的精确 File ID 与 Version ID，验证二者归属关系，并返回按行定位的窗口。

Markdown 文本在 Host 解码。PDF.js 与 Mammoth 提取运行在一次性 Node Worker 中，具备源字节、提取文本、Heap、墙钟和取消预算。Mammoth 只使用 `extractRawText`；不会启用 HTML 转换或 `externalFileAccess`。搜索会报告跳过/无法提取的文件，不会声称覆盖完整。

每个 Search/Read 渲染结果都会把文档标记为不可信证据，并包含名称、File ID、Version ID、摘要、分类、媒体类型、文件夹路径和标签。Harness 会把这份精确的模型可见文本快照写入 `tool/result`，因此无需扩张 Session Event 词汇，就能在回放时重建模型看到的版本和文本窗口。

## 实现说明

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | Tool Schema、配置、Prompt 指引、list/search/read 执行以及 DTO/渲染预算 |
| [`src/catalog.ts`](src/catalog.ts) | 有界文件夹遍历、当前版本关系校验和稳定文件夹路径 |
| [`src/extract.ts`](src/extract.ts) | 一次性 Worker 生命周期、源/Heap/时间预算、取消和结果校验 |
| [`src/worker.ts`](src/worker.ts) | PDF.js/Mammoth 纯提取和 Worker 入口 |
| [`src/budget.ts`](src/budget.ts) | UTF-8、JSON、条目和行窗口预算 |
| [`src/render.ts`](src/render.ts) | 持久化到 `tool/result` 的稳定来源和不可信证据 Envelope |
| [`src/policy.ts`](src/policy.ts) | 对所有继承/全局工具应用 Scope-only 空 Allowlist |
| [`presets/positioning-safety/`](presets/positioning-safety/) | 定位安全 Agent 组合和 Picker 元数据 |

## 进一步阅读

- [Drive Service Definition](../drive/README.zh.md)——提供方无关的文件/版本权威。
- [Buddy Drive Bundle](../drive-app/README.zh.md)——安装本包并增加 Preset Root。
- [开发 TODO](../../../BUDDY_DRIVE_TODO.md)——阶段验收和剩余加固。

## 模型体验

### 只读受控证据

#### 模型看到什么

模型会看到三个 Tool Schema 和一个固定 Prompt Section。在模型显式调用 Drive Tool 之前，任何资料库元数据或文档内容都不会进入请求。成功的 `drive_read` Result 会逐字包含不可信证据边界、不可变来源、截断事实和选定文本窗口。

#### Token 影响

固定指引会增加一个小型且稳定的 System Prompt Section。每个 Tool Result 只增加本次调用选择的有界目录行、搜索片段或读取窗口；默认渲染输出上限为 48 KiB，Canonical Value 上限为 64 KiB。

#### KV Cache 影响

固定 Prompt Section 对该 Preset 保持 Cache-stable。Tool Result 追加在缓存前缀之后，并随 File ID、Version ID、摘要和选定文本而变化。不存在自动文档注入导致的请求前缀失效。

## 已知限制与延期工作

- **只搜索当前版本**：搜索检查每个可见文件的当前不可变版本；历史版本搜索需要未来显式 Consumer。
- **线性有界搜索**：第一版本地实现每次最多扫描 100 个文件，并报告 skipped/truncated 覆盖。索引搜索属于阶段 5。
- **纯文本提取**：PDF 页标记和 Mammoth Raw Text 保留证据文本，不保留视觉布局、表格或精确分页语义；浏览器预览仍是视觉权威。
- **无 OCR**：不含嵌入文本的扫描 PDF 无法提取，并会报告为跳过/搜索未命中。
- **无修改 Surface**：刻意不提供 create-version、重命名、移动、分类、删除、恢复和发布。
- **Mammoth 依赖审查**：`mammoth@1.12.2` 精确锁定；因安装时仍处于发布时间窗口，仓库 Supply-chain Exception 明确列出它。升级必须重新完成许可证/安全和提取 Fixture 评审。

### 开发备注

<details><summary>维护者工作上下文——点击展开</summary>

保持渲染来源 Envelope 与 Canonical DTO 预算一致。不要增加 Path 参数、隐式当前版本读取、自动 Prompt 注入或自定义 Session Event；普通持久 `tool/result` 就是回放契约。

</details>
