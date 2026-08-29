---
description: "可选 Buddy Web Bundle：在原生 Web 层之后挂载本地 Drive Provider、浏览器 API 和独立云盘 UI。"
kind: "package-bundle"
---

# @sospink/dsh-buddy-drive-app

[English](README.md) | 中文

## 摘要

`@sospink/dsh-buddy-drive-app` 是完整 Buddy 资料云盘栈的可选 Bundle 层。在 `@deepseek-ai/dsh-web-app` 之后应用；Patch 会在 `$DSH_HOME/buddy-drive` 挂载本地 Drive Provider、生成式 Remote 与认证二进制 API、独立浏览器 UI，以及只读定位安全 Agent Preset/Tool 包。移除本 Bundle 即可移除 Buddy Drive Row，无需修改上游 Package。

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

本层使用阶段一默认限制：单文件 50 MiB、保留逻辑字节 2 GiB、DOCX 条目/解压/压缩比限制和 100,000 条审计。部署策略不同时，在更后的 Profile Patch 覆盖 `buddy-drive-local` Row。

## 实现说明

本包包含一个 `cordis.patch.yml` 和一个 Marker Loader Plugin。Patch 插入 `buddy-drive-local`、`buddy-api-drive` 和 `buddy-client-ui-drive` 三个 Row。Cordis Injection 会让它们等待前置原生层提供的 Storage Domain、WebServer、Connection、Typert、Remote、Locale 和 Slot Service。

## 进一步阅读

- [Buddy 包地图](../README.zh.md)——本层挂载的 Package。
- [开发 TODO](../../../BUDDY_DRIVE_TODO.md)——分阶段验收证据。

## 模型体验

### Bundle 组合

#### 模型看到什么

`@sospink/dsh-buddy-drive-app` Bundle 不直接向模型提供内容。它挂载文档存储和浏览器 Surface；当前被挂载 Package 不注册模型 Tool 或 Prompt。

#### Token 影响

普通 Preset 的直接 Token 为零。定位安全 Agent 会增加 `@sospink/dsh-buddy-tool-drive` 记录的 Complete Persona、三个 Drive Tool Schema 和显式结果。

#### KV Cache 影响

与模型请求独立；后续 Drive Tool Consumer 对请求影响负责。

## 已知限制与延期工作

- **本地 Provider Bundle**——本层选择本地磁盘 Provider；远程对象存储部署需要不同 Bundle 或后续 Row 覆盖。
- **尚不是上游内置 Profile Template**——在 Buddy 产品 Profile 和品牌通过验收前，本 Bundle 有意保持可选。
- **预览与 Agent Tool 属于后续阶段**——本层目前挂载资料管理；文档 Viewer 和只读模型 Tool 在后续变更交付。

### 开发备注

<details><summary>维护者工作上下文——点击展开</summary>

Bundle 保持声明式。产品行为属于被挂载 Package，不属于 Marker Plugin。

</details>
