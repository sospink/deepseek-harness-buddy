---
description: "Standalone Buddy Drive browser workspace: generated Remote mounting, reconnecting state, uploads, sidebar entry, file management, and details surface."
kind: "package-reference"
---

# @sospink/dsh-buddy-client-ui-drive

English | [中文](README.zh.md)

## Summary

`@sospink/dsh-buddy-client-ui-drive` is the browser application surface for Buddy Drive. It mounts the generated `drive` Remote contribution into `ctx.remote`, follows complete reconnect snapshots, exposes a React-free `ctx.buddyDriveUi` state and command service, registers a Document Drive action in `sidebar.footer.action`, and renders a standalone three-column workspace in `shell.overlay`. All writes and uploads use real Host APIs; the UI contains no demo data or fixed-success path.

## Use this package

Mount it beside the stock Web Client modules after API Gateway, Connection, Locale, Layout, Sidebar, and UI Renderer. Its Client module mounts `@sospink/dsh-buddy-api-drive/remote` itself, so the fork does not modify the upstream `api-remotes` assembly.

The sidebar action opens the Drive and restores focus when the Drive closes. The application workspace contains folder navigation, search and upload controls, a file list, and file details/actions. Users can create folders, upload Markdown/PDF/DOCX documents, select an upload classification, search the current folder, show deleted files, update classification, download originals, soft-delete, and restore.

The details column deliberately states that online preview is pending until the viewer phase. It never renders a fake preview or claims that file content has been converted.

## Understand the implementation

| File | Role |
|---|---|
| [`src/client/service.ts`](src/client/service.ts) | Remote mount consumer, reconnect snapshot model, upload and metadata actions, focus restoration, content URLs |
| [`src/client/index.ts`](src/client/index.ts) | Client module lifecycle, Remote contribution mount, dictionaries, and Slot registrations |
| [`src/client/DriveTrigger.tsx`](src/client/DriveTrigger.tsx) | Wide/rail sidebar entry |
| [`src/client/DriveOverlay.tsx`](src/client/DriveOverlay.tsx) | Three-column file-management workspace and explicit preview-pending detail area |
| [`src/client/locales.ts`](src/client/locales.ts) | Typed Chinese and English product copy |

## Further Exploration

- [Buddy Drive browser API](../api-drive/README.md) — generated Remote and authenticated upload/content routes.
- [Buddy Drive Bundle](../drive-app/README.md) — optional Web profile composition.
- [Delivery TODO](../../../BUDDY_DRIVE_TODO.md) — acceptance status and preview work.

## Model Experience

### Drive browser state

#### What the model sees

Nothing. The package mounts browser state through `ctx.buddyDriveUi` and user actions only; it contributes no prompt, tool schema, or session event.

#### Token effect

Zero direct tokens.

#### KV Cache effect

Independent of model requests; browser file management never alters a request prefix.

## Known Limitations and Deferred Work

- **Preview placeholder is explicit** — online Markdown/PDF/DOCX rendering is not implemented in this package version; the original file can be downloaded.
- **Current-folder search only** — the search field filters the selected folder in memory; indexed cross-folder and content search are later work.
- **Sequential multi-file upload** — selected files upload one at a time to keep ordering and error behavior simple; bounded parallel progress arrives with the upload queue refinement.
- **Narrow layouts hide details** — below 900px the details column is hidden; a dedicated mobile file/details navigation remains deferred.

### Dev Note

<details><summary>Working context for maintainers — click to expand</summary>

Keep preview implementations behind file-media renderers rather than adding format conditionals throughout the navigation and list components.

</details>
