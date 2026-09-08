---
description: "Buddy 新会话工作区中的分组专业身份选择器。"
kind: "package"
---

# @sospink/dsh-buddy-client-ui-agent-role

[English](README.md) | 中文

## 概述

本浏览器包挂载 Agent Role Remote，并填充 `conversation.hero.agentRole`。紧凑的黑色磨砂选择器位于空白会话画布的“工作区”和“Agent Preset”旁边；菜单按“产品、技术、质量”分组，并为每个身份展示简短能力说明。

用户可在工作区创建接收会话前暂存选择。空白会话可用后，选择会提交至 Host；刷新后由既有会话 projection 恢复显示。已经开始的会话不会被改写。

## 已知限制

- 选择器只显示在空白会话 Hero；活跃会话通过已固定的专业行为体现身份，不提供可编辑入口。
- 暂不包含身份管理和自定义身份编写功能。
