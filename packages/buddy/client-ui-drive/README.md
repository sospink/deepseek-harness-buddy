---
description: "Standalone Buddy Drive browser workspace: generated Remote mounting, reconnecting state, bounded upload queue, sidebar entry, file management, and details surface."
kind: "package-reference"
---

# @sospink/dsh-buddy-client-ui-drive

English | [中文](README.zh.md)

## Summary

`@sospink/dsh-buddy-client-ui-drive` is the browser application surface for Buddy Drive. It mounts the generated `drive` Remote contribution into `ctx.remote`, follows complete reconnect snapshots, exposes a React-free `ctx.buddyDriveUi` state and command service, registers a Document Drive action in `sidebar.footer.action`, and renders a standalone three-column workspace in `shell.overlay`. All writes and uploads use real Host APIs; the UI contains no demo data or fixed-success path.

The same Client package provides the controlled HTML prototype canvas. Edit mode directly selects, drags, and resizes DOM elements through eight handles, supports inline text editing, and exposes dimensions, typography, colors, fill, radius, and opacity in the property inspector. Structured operations persist per Session in the browser with reload replay, undo, redo, parent selection, element hiding, and full reset while packaged HTML source files remain unchanged.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Use this package

Mount it beside the stock Web Client modules after API Gateway, Connection, Locale, Layout, Sidebar, and UI Renderer. Its Client module mounts `@sospink/dsh-buddy-api-drive/remote` itself, so the fork does not modify the upstream `api-remotes` assembly.

The sidebar action opens the Drive and restores focus when the Drive closes. The application workspace contains folder navigation, search and upload controls, a file list, and file details/actions. Users can create folders, select an upload classification, add up to 100 Markdown/PDF/DOCX files to a bounded queue, observe per-file and aggregate progress, cancel queued or active work, retry failed/cancelled work, clear completed/cancelled rows, search the current folder, show deleted files, update classification, download originals, soft-delete, and restore. At most two files upload concurrently; one failure does not stop later queue items.

Each queue item owns one stable upload id for its lifetime. The Client sends it as `X-Buddy-Drive-Upload-Id`, so a retry after a transport abort can replay a Host commit without creating a duplicate file. A successful Host `201` remains successful even when the follow-up metadata refresh fails; the refresh error is reported separately.

Markdown files have a real rendered/source preview backed by the immutable content route and Harness `MarkdownText`. Source mode retains at most 2 MiB; rich rendering independently admits at most a 256 KiB/4,000-line UTF-8 prefix so long documents cannot create an unbounded Markdown AST/DOM. The browser cancels stale reads when selection changes and escapes parsed image markers before rendering so document-authored HTTP(S) images cannot issue requests. Raw HTML remains literal under the Harness renderer.

PDF files use a real PDF.js Canvas viewer backed by the immutable Range route, a pinned same-origin Worker, and authenticated packed CMaps. The viewer keeps one page resident, supports previous/next navigation, 50%–200% zoom, and explicit text search across at most 500 pages. Annotation rendering and scripting layers never mount. Document/page JavaScript actions are detected only to display a blocked warning; absolute HTTP(S) annotations become separate explicit-click links, while dangerous protocols remain absent. DOCX files use a two-boundary preview. A dedicated Worker rechecks the OOXML ZIP with a 20 MiB encoded budget, 1,000-entry cap, 64 MiB expanded budget, 100:1 ratio cap, and a 10-second timeout. Only the transferred safe buffer reaches a `sandbox="allow-scripts"` iframe without `allow-same-origin`; its CSP disables network, forms, objects, child frames, and navigation. Pinned `docx-preview` renders there with `renderAltChunks:false` and base64 resources, the iframe sanitizes active elements/attributes, auto-fits fixed Word pages to the details width, and sends only boot/ready/failure plus page count to the parent.

The standalone workspace uses a native file input and returns focus to its opener when closed. The modal focuses the upload action, contains forward/reverse Tab traversal, and keeps folders, files, preview/details, and original download reachable at a 390 px viewport without horizontal overflow.

## Understand the implementation

| File | Role |
|---|---|
| [`src/client/service.ts`](src/client/service.ts) | Remote mount consumer, reconnect snapshot model, upload and metadata actions, focus restoration, content URLs |
| [`src/client/upload.ts`](src/client/upload.ts) | Same-origin XHR upload transport, bounded progress, timeout, and cancellation |
| [`src/client/UploadQueue.tsx`](src/client/UploadQueue.tsx) | Bounded queue projection, progress summary, cancellation, retry, and cleanup controls |
| [`src/client/index.ts`](src/client/index.ts) | Client module lifecycle, Remote contribution mount, dictionaries, and Slot registrations |
| [`src/client/DriveTrigger.tsx`](src/client/DriveTrigger.tsx) | Wide/rail sidebar entry |
| [`src/client/DriveOverlay.tsx`](src/client/DriveOverlay.tsx) | Three-column file-management workspace and format-specific preview seat |
| [`src/client/MarkdownPreview.tsx`](src/client/MarkdownPreview.tsx) | Markdown rendered/source UI, cancellation, retry, and Harness `MarkdownText` composition |
| [`src/client/markdown-preview.ts`](src/client/markdown-preview.ts) | Bounded UTF-8 loading and parsed image-marker deactivation |
| [`src/client/PdfPreview.tsx`](src/client/PdfPreview.tsx) | Single-page Canvas viewer, navigation, zoom, search, script warning, and explicit links |
| [`src/client/pdf-preview.ts`](src/client/pdf-preview.ts) | PDF budgets, Range options, text search, Canvas sizing, and annotation URL policy |
| [`src/client/pdf-runtime.ts`](src/client/pdf-runtime.ts) | Lazy PDF.js runtime boundary |
| [`src/client/DocxPreview.tsx`](src/client/DocxPreview.tsx) | Bounded download, Worker preflight, opaque iframe lifecycle, timeout, and status UI |
| [`src/client/docx-preview.ts`](src/client/docx-preview.ts) | Worker/frame protocol, budgets, CSP srcdoc, sanitizer, and responsive page fitting |
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

- **DOCX fidelity is browser-derived** — `docx-preview` preserves common pagination, tables, images, headers/footers, and styles but is not Microsoft Word; complex fields, tracked changes, comments, shapes, and fonts may differ.
- **DOCX has no parent-visible text/search surface** — the opaque iframe deliberately withholds Word DOM and text from the parent. Semantic extraction/search remains deferred and must use a separately bounded, sanitized Worker pipeline.
- **DOCX preview budget is stricter than storage admission** — the browser caps encoded DOCX at 20 MiB and expanded content at 64 MiB even though Host storage accepts larger files; oversized originals remain downloadable.
- **PDF search is page-level** — one search checks at most 500 pages and navigates to the first matching page; it does not yet paint match highlights or expose a text layer.
- **Native Safari automation remains an environment gate** — Chromium and Playwright WebKit 26.5 pass the shared preview acceptance suite. Safari 26.3.1 still needs “Allow remote automation” enabled before `safaridriver` can supply native-Safari evidence.
- **PDF page virtualization is single-resident** — only the current Canvas page is retained. Thumbnail strips, continuous scrolling, printing, forms, attachments, outlines, and internal destinations remain deferred.
- **PDF client bundle cost** — PDF.js is inlined into the one Loader-owned `client.js` to avoid unsupported dynamic chunks; the uncompressed Buddy Client artifact is currently about 1.40 MB.
- **Markdown preview budget** — source mode retains at most 2 MiB of one immutable version, while rich rendering uses only a 256 KiB/4,000-line prefix and reports truncation. Larger originals remain downloadable.
- **Remote Markdown images are inactive** — parsed inline/reference images render as inert Markdown text; there is no per-document image allowlist yet.
- **Current-folder search only** — the search field filters the selected folder in memory; indexed cross-folder and content search are later work.
- **Bounded upload queue** — the browser retains at most 100 rows and sends at most two requests concurrently. Queue state is intentionally ephemeral; a page reload does not resume in-flight files, while Host idempotency prevents a retry from duplicating a commit that already reached the server.
- **Narrow screens use stacked navigation** — below 900px folders, file list, and details stack vertically. A dedicated route/history model for mobile file/details navigation remains deferred.

### Dev Note

<details><summary>Working context for maintainers — click to expand</summary>

Keep preview implementations behind file-media renderers rather than adding format conditionals throughout the navigation and list components. A format renderer must own its complete byte/time budget, cancellation, and external-resource policy before it enters the detail seat.

</details>
