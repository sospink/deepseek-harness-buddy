---
description: "可选 Buddy Web Bundle：在原生 Web 层之后挂载本地 Drive Provider、浏览器 API 和独立云盘 UI。"
kind: "package-bundle"
---

# @sospink/dsh-buddy-drive-app

[English](README.md) | 中文

## 概述

`@sospink/dsh-buddy-drive-app` 是完整 Buddy 资料云盘栈的可选 Bundle 层。在 `@deepseek-ai/dsh-web-app` 之后应用；Patch 会在 `$DSH_HOME/buddy-drive` 挂载本地 Drive Provider、生成式 Remote 与认证二进制 API、独立浏览器 UI，以及只读定位安全 Agent Preset/Tool 包。移除本 Bundle 即可移除 Buddy Drive Row，无需修改上游 Package。

## 目录

- [使用本包](#use-this-package)
- [实现说明](#understand-the-implementation)
- [进一步阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

## 使用本包

在 Base 和 Web Bundle 之后加入本 Bundle：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@sospink/dsh-buddy-drive-app"
      ]
    }
  }
}
```

本层使用阶段一默认限制：单文件 50 MiB、保留逻辑字节 2 GiB、DOCX 条目/解压/压缩比限制和 100,000 条审计。部署策略不同时，在更后的 Profile Patch 覆盖 `buddy-drive-local` Row。本层还会完整重述 `agent-presets` 的 `default: standard`、`includeShippedRoot: true` 和 `includeUserRoot: true`，并增加 fork 自有的只读 System Preset Root，因此官方和用户 Preset 仍然可用。

## 实现说明

本包包含一个 `cordis.patch.yml` 和一个 Marker Loader Plugin。Patch 插入三个 Drive Row，并替换完整的 `agent-presets` 配置以加入 Tool 包的 `presets/` 目录。Preset Root 通过 `@sospink/dsh-buddy-drive-app/package.json` 及其包内依赖解析，因此无论 pnpm 嵌套还是提升 `tool-drive` 都可工作。Cordis Injection 会让 Drive Row 等待前置原生层提供的 Storage Domain、WebServer、Connection、Typert、Remote、Locale 和 Slot Service。

## 进一步阅读

- [Buddy 包地图](../README.zh.md)——本层挂载的 Package。
- [开发 TODO](../../../BUDDY_DRIVE_TODO.md)——分阶段验收证据。

## 模型体验

### Bundle 组合

#### 模型看到什么

本 Bundle 增加一个可选的定位安全 Agent Preset。普通/默认 Session 仍使用 `standard`；只有显式选择 `positioning-safety` 的 Session 才会获得固定的不可信证据 Persona 和三个只读 Drive Tool。

#### Token 影响

普通 Preset 的直接 Token 为零。定位安全 Agent 会增加 `@sospink/dsh-buddy-tool-drive` 记录的 Complete Persona、三个 Drive Tool Schema 和显式结果。

#### KV Cache 影响

普通 Preset 保持不变。定位安全 Agent 使用稳定的 Complete Persona；显式 Drive Result 追加在可缓存前缀之后，并随文件版本变化。

## 已知限制与延期工作

- **本地 Provider Bundle**——本层选择本地磁盘 Provider；远程对象存储部署需要不同 Bundle 或后续 Row 覆盖。
- **尚不是上游内置 Profile Template**——在 Buddy 产品 Profile 和品牌通过验收前，本 Bundle 有意保持可选。
- **预览与 Agent Tool 是独立边界**——本层只负责组合；浏览器 Viewer 的安全/性能预算由 Client UI 包负责，只读模型工具与来源/回放边界由 Tool Drive 包负责。

### 开发备注

<details><summary>维护者工作上下文——点击展开</summary>

Bundle 保持声明式。产品行为属于被挂载 Package，不属于 Marker Plugin。

</details>
