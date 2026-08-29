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

Markdown files have a real rendered/source preview backed by the immutable content route and Harness `MarkdownText`. The browser retains at most 2 MiB, cancels stale reads when selection changes, and escapes parsed image markers before rendering so document-authored HTTP(S) images cannot issue requests. Raw HTML remains literal under the Harness renderer. PDF and DOCX details continue to state explicitly that their preview slices are pending.

## Understand the implementation

| File | Role |
|---|---|
| [`src/client/service.ts`](src/client/service.ts) | Remote mount consumer, reconnect snapshot model, upload and metadata actions, focus restoration, content URLs |
| [`src/client/index.ts`](src/client/index.ts) | Client module lifecycle, Remote contribution mount, dictionaries, and Slot registrations |
| [`src/client/DriveTrigger.tsx`](src/client/DriveTrigger.tsx) | Wide/rail sidebar entry |
| [`src/client/DriveOverlay.tsx`](src/client/DriveOverlay.tsx) | Three-column file-management workspace and format-specific preview seat |
| [`src/client/MarkdownPreview.tsx`](src/client/MarkdownPreview.tsx) | Markdown rendered/source UI, cancellation, retry, and Harness `MarkdownText` composition |
| [`src/client/markdown-preview.ts`](src/client/markdown-preview.ts) | Bounded UTF-8 loading and parsed image-marker deactivation |
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

- **PDF and DOCX remain explicit placeholders** — Markdown preview is implemented; PDF.js and isolated DOCX rendering remain later slices, and originals stay downloadable.
- **Markdown preview budget** — the browser renders at most 2 MiB of one immutable Markdown version. Larger documents remain downloadable instead of being partially rendered.
- **Remote Markdown images are inactive** — parsed inline/reference images render as inert Markdown text; there is no per-document image allowlist yet.
- **Current-folder search only** — the search field filters the selected folder in memory; indexed cross-folder and content search are later work.
- **Sequential multi-file upload** — selected files upload one at a time to keep ordering and error behavior simple; bounded parallel progress arrives with the upload queue refinement.
- **Narrow layouts hide details** — below 900px the details column is hidden; a dedicated mobile file/details navigation remains deferred.

### Dev Note

<details><summary>Working context for maintainers — click to expand</summary>

Keep preview implementations behind file-media renderers rather than adding format conditionals throughout the navigation and list components. A format renderer must own its complete byte/time budget, cancellation, and external-resource policy before it enters the detail seat.

</details>
