---
description: "Package map for fork-owned Buddy product capabilities that extend DeepSeek Harness without publishing under the upstream namespace."
kind: "package-group"
---

# buddy/ — fork-owned Buddy product capabilities

English | [中文](README.zh.md)

## Summary

The `buddy/` group contains private packages owned by the `sospink/deepseek-harness-buddy` fork. These packages extend the upstream Harness through documented Cordis services and narrow composition points while keeping the `@deepseek-ai` namespace and upstream release family untouched. The first capability is the standalone document drive for the Positioning Safety Agent product mode.

## Packages

| Package | Role | ctx key |
|---|---|---|
| [`drive/`](drive/README.md) | Provider-neutral library, folder, file, version, audit, and content-read contract | `ctx.drive` |
| [`drive-local/`](drive-local/README.md) | Local atomic metadata and content-addressed blob provider | registers on `ctx.drive` |

## Related documentation

- [Safety Agent drive proposal](../../.agents/notes/proposed/feature/2026-08-29-safety-agent-drive-library.md) — capability boundary, preview plan, security posture, and phased delivery.
- [Delivery TODO](../../BUDDY_DRIVE_TODO.md) — requirement ledger, acceptance evidence, and current implementation status.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Fork-owned packages are private workspace members until a separate publication and compatibility policy is approved. Do not rename them into the `@deepseek-ai` namespace.

</details>
