---
description: "Package map for fork-owned Buddy product capabilities that extend DeepSeek Harness without publishing under the upstream namespace."
kind: "package-group"
---

# buddy/ — fork-owned Buddy product capabilities

English | [中文](README.zh.md)

## Summary

The `buddy/` group contains private packages owned by the `sospink/deepseek-harness-buddy` fork. These packages extend the upstream Harness through documented Cordis services and narrow composition points while keeping the `@deepseek-ai` namespace and upstream release family untouched. The product layer includes the standalone document drive and a controlled ZhiYu City AI prototype canvas.

A browser that has not acknowledged the current welcome version presents a single-viewport, full-bleed video surface before its first blank session. The existing sidebar, workspace picker, and resident composer return after the user selects Get Started, and that acknowledgement persists so reloads return directly to the workspace. Existing conversations, trajectory views, and prototype canvases bypass this welcome layer.

## Packages

| Package | Role | ctx key |
|---|---|---|
| [`drive/`](drive/README.md) | Provider-neutral library, folder, file, version, audit, and content-read contract | `ctx.drive` |
| [`drive-local/`](drive-local/README.md) | Local atomic metadata and content-addressed blob provider | registers on `ctx.drive` |
| [`api-drive/`](api-drive/README.md) | Generated Remote commands, authenticated Drive routes, and offline prototype assets | `ctx.buddyDriveController`, `ctx.remote.drive` |
| [`client-ui-drive/`](client-ui-drive/README.md) | Drive workspace plus the pannable, zoomable Prototype Conversation View with direct HTML element editing | `ctx.buddyDriveUi` |
| [`drive-app/`](drive-app/README.md) | Optional Web Bundle mounting the complete Drive stack | patch layer |
| [`tool-drive/`](tool-drive/README.md) | Read-only Drive tools, controlled prototype tools, and Positioning Safety Agent preset | scoped `ctx.tools` Consumer |
| [`agent-role/`](agent-role/README.md) | Durable professional-role catalog, session event, projection, and model context | `ctx.agentRoles` |
| [`client-ui-agent-role/`](client-ui-agent-role/README.md) | Grouped professional-role selector for blank sessions | `conversation.hero.agentRole` |
| [`development-management/`](development-management/README.md) | Durable role workflow, streamed engineering artifacts, real Git delivery review, and MR gates | `ctx.developmentManagement` |
| [`client-ui-development-management/`](client-ui-development-management/README.md) | Dark acrylic Development Management sidebar workspace | `sidebar.footer.action`, `shell.overlay` |

## Related documentation

- [Buddy Drive subsystem](../../docs/subsystems/buddy-drive.md) — the provider, browser adapter, and read-only model Consumer boundaries.
- [Safety Agent drive proposal](../../.agents/notes/proposed/feature/2026-08-29-safety-agent-drive-library.md) — capability boundary, preview plan, security posture, and phased delivery.
- [Delivery TODO](../../BUDDY_DRIVE_TODO.md) — requirement ledger, acceptance evidence, and current implementation status.
- [Development Management acceptance ledger](../../docs/buddy-development-management-ledger.md) — role, upload, Git review, and merge evidence.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Fork-owned packages are private workspace members until a separate publication and compatibility policy is approved. Do not rename them into the `@deepseek-ai` namespace.

</details>
