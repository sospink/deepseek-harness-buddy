---
description: "Durable professional working roles for Buddy sessions and model requests."
kind: "package"
---

# @sospink/dsh-buddy-agent-role

English | [中文](README.zh.md)

## Summary

This Host package lets a person choose a professional working role before a Buddy session starts. The shipped catalog contains General Agent, Business Requirements Analyst, Product Solution Designer, Prototype Designer, Software Architect, AI Application Engineer, Blockchain Engineer, and Code Review Expert.

The role is independent from the Agent preset. A preset chooses tools, permissions, and plugin composition; a role adds a specialized working method to the model context. The selected role is recorded as `agent-role/selected`, projected to session summaries, and folded again for every model request so reload, resume, and fork preserve it.

## Model Experience

General Agent contributes no extra text. Each specialized role contributes one stable runtime-context paragraph covering its responsibilities, decision criteria, and anti-hallucination boundary. Selection is allowed only before `turn/start`; this keeps a session's behavior stable and preserves the request prefix for KV caching.

Complete persona presets may suppress runtime contexts by design. In that case the complete persona remains authoritative even though the durable role remains visible and logged.

## Known Limitations

- The catalog is currently product-owned and static; administrators cannot add custom roles from settings.
- A role is fixed after the first turn. Start a new session to use another role.
