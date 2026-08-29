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

Markdown files have a real rendered/source preview backed by the immutable content route and Harness `MarkdownText`. The browser retains at most 2 MiB, cancels stale reads when selection changes, and escapes parsed image markers before rendering so document-authored HTTP(S) images cannot issue requests. Raw HTML remains literal under the Harness renderer.

PDF files use a real PDF.js Canvas viewer backed by the immutable Range route, a pinned same-origin Worker, and authenticated packed CMaps. The viewer keeps one page resident, supports previous/next navigation, 50%–200% zoom, and explicit text search across at most 500 pages. Annotation rendering and scripting layers never mount. Document/page JavaScript actions are detected only to display a blocked warning; absolute HTTP(S) annotations become separate explicit-click links, while dangerous protocols remain absent. DOCX details continue to state explicitly that their preview slice is pending.

## Understand the implementation

| File | Role |
|---|---|
| [`src/client/service.ts`](src/client/service.ts) | Remote mount consumer, reconnect snapshot model, upload and metadata actions, focus restoration, content URLs |
| [`src/client/index.ts`](src/client/index.ts) | Client module lifecycle, Remote contribution mount, dictionaries, and Slot registrations |
| [`src/client/DriveTrigger.tsx`](src/client/DriveTrigger.tsx) | Wide/rail sidebar entry |
| [`src/client/DriveOverlay.tsx`](src/client/DriveOverlay.tsx) | Three-column file-management workspace and format-specific preview seat |
| [`src/client/MarkdownPreview.tsx`](src/client/MarkdownPreview.tsx) | Markdown rendered/source UI, cancellation, retry, and Harness `MarkdownText` composition |
| [`src/client/markdown-preview.ts`](src/client/markdown-preview.ts) | Bounded UTF-8 loading and parsed image-marker deactivation |
| [`src/client/PdfPreview.tsx`](src/client/PdfPreview.tsx) | Single-page Canvas viewer, navigation, zoom, search, script warning, and explicit links |
| [`src/client/pdf-preview.ts`](src/client/pdf-preview.ts) | PDF budgets, Range options, text search, Canvas sizing, and annotation URL policy |
| [`src/client/pdf-runtime.ts`](src/client/pdf-runtime.ts) | Lazy PDF.js runtime boundary |
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

- **DOCX remains an explicit placeholder** — Markdown and PDF preview are implemented; isolated DOCX rendering remains a later slice, and originals stay downloadable.
- **PDF search is page-level** — one search checks at most 500 pages and navigates to the first matching page; it does not yet paint match highlights or expose a text layer.
- **PDF page virtualization is single-resident** — only the current Canvas page is retained. Thumbnail strips, continuous scrolling, printing, forms, attachments, outlines, and internal destinations remain deferred.
- **PDF client bundle cost** — PDF.js is inlined into the one Loader-owned `client.js` to avoid unsupported dynamic chunks; the uncompressed Buddy Client artifact is currently about 1.38 MiB.
- **Markdown preview budget** — the browser renders at most 2 MiB of one immutable Markdown version. Larger documents remain downloadable instead of being partially rendered.
- **Remote Markdown images are inactive** — parsed inline/reference images render as inert Markdown text; there is no per-document image allowlist yet.
- **Current-folder search only** — the search field filters the selected folder in memory; indexed cross-folder and content search are later work.
- **Sequential multi-file upload** — selected files upload one at a time to keep ordering and error behavior simple; bounded parallel progress arrives with the upload queue refinement.
- **Narrow layouts hide details** — below 900px the details column is hidden; a dedicated mobile file/details navigation remains deferred.

### Dev Note

<details><summary>Working context for maintainers — click to expand</summary>

Keep preview implementations behind file-media renderers rather than adding format conditionals throughout the navigation and list components. A format renderer must own its complete byte/time budget, cancellation, and external-resource policy before it enters the detail seat.

</details>
