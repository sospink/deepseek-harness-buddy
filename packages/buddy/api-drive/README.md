---
description: "Buddy Drive browser API: generated Remote metadata commands, reconnect snapshots, authenticated raw uploads, and defensive range content responses."
kind: "package-reference"
---

# @sospink/dsh-buddy-api-drive

English | [中文](README.zh.md)

## Summary

`@sospink/dsh-buddy-api-drive` is the Host browser adapter for `ctx.drive`. It exposes metadata commands and a reconnect-safe full-snapshot stream through generated Typert Remote namespace `drive`, then registers authenticated binary routes for raw uploads, immutable content reads, and pinned PDF.js and DOCX preview assets. The package owns browser transport and failure mapping only; the Drive provider remains the authority for admission, metadata, blobs, quotas, audit, and recovery.

## Use this package

Mount it after Typert, the Drive provider, WebServer, and the Host Connection service. The Connection service supplies the same Host/Origin DNS-rebinding fence and persistent browser-session authentication used by `/api`; every WebServer route calls `ctx.connection.requestRejection()` before reading or serving bytes.

### Remote metadata methods

The generated `ctx.remote.drive` namespace provides `baseline`, `createFolder`, `renameFolder`, `moveFolder`, `renameFile`, `moveFile`, `updateFileMetadata`, `deleteFile`, `restoreFile`, `versions`, `audit`, and streaming `follow`. A follow generation starts with a complete baseline and receives a complete snapshot after every committed `drive/changed` event, so reconnect and missed-frame recovery require no client diff replay.

### Upload route

`POST /api/buddy-drive/upload` accepts an `application/octet-stream` body bounded by `ctx.drive.limits.maxFileBytes`. A new file supplies one `name`, one `kind`, optional `parentId`, and repeated `tag` query values. A new version supplies only `fileId`. Optional `X-Buddy-Drive-Media-Type` is advisory and must agree with Host admission. The route never accepts a filesystem path or Base64 JSON body.

### Content route

`GET|HEAD /api/buddy-drive/content/<versionId>` returns one verified immutable version. It supports one standard byte range (`start-end`, `start-`, or suffix), returns `416` with `Content-Range: bytes */<size>` for invalid ranges, and emits `Accept-Ranges`, a digest ETag, `nosniff`, private/no-store caching, inline UTF-8 disposition, and a sandboxing Content Security Policy.

### PDF.js asset routes

`GET|HEAD /api/buddy-drive/assets/pdf.worker-6.2.108.mjs` serves the pinned PDF.js Worker from the installed `pdfjs-dist` package. `GET|HEAD /api/buddy-drive/assets/cmaps/<name>.bcmap` serves only filenames enumerated from that package's packed CMap directory. Both surfaces are authenticated, same-origin, immutable, and `nosniff`; unknown files, nested paths, traversal forms, and unsupported methods are rejected. No PDF runtime or CMap is fetched from a CDN.

### DOCX preview asset routes

`GET|HEAD /api/buddy-drive/assets/docx-preflight-0.4.0.js` serves a self-contained JSZip Worker that rechecks OOXML structure, entry/expanded-byte/compression budgets, unsafe member paths, macros, AltChunk, embedded packages, DTD/entities, and external relationships. `GET|HEAD /api/buddy-drive/assets/docx-runtime-0.4.0.js` serves pinned JSZip plus `docx-preview` UMD bytes for execution only inside the opaque preview iframe. Both routes are authenticated, same-origin, immutable, and `nosniff`; the browser does not use a CDN.

## Understand the implementation

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Typert Remote owner and binary-route registration lifecycle |
| [`src/commands.ts`](src/commands.ts) | Unary command projection and stable `TypertRemoteFailure` mapping |
| [`src/feed.ts`](src/feed.ts) | Complete baseline traversal and reconnect snapshot generations |
| [`src/http.ts`](src/http.ts) | Authenticated upload/content/PDF-asset handlers, query validation, ranges, and defensive headers |
| [`src/pdf-assets.ts`](src/pdf-assets.ts) | Pinned PDF Worker bytes and allowlisted packed CMap lookup/cache |
| [`src/docx-assets.ts`](src/docx-assets.ts) | Self-contained OOXML preflight Worker and iframe-only DOCX runtime bytes |
| [`src/paths.ts`](src/paths.ts) | Browser-safe public HTTP route constants |
| [`src/body.ts`](src/body.ts) | Exact bounded raw request-body intake |
| [`src/types.ts`](src/types.ts) | Browser-safe Remote and HTTP response vocabulary |

## Further Exploration

- [Drive Service Definition](../drive/README.md) — provider-neutral entities and operations.
- [Local Drive provider](../drive-local/README.md) — admission, metadata, and blob authority.
- [Buddy package map](../README.md) — fork-owned package family.
- [Delivery TODO](../../../BUDDY_DRIVE_TODO.md) — phase acceptance and remaining UI/preview work.

## Model Experience

### Browser drive transport

#### What the model sees

Nothing. This package exposes browser Remote and HTTP surfaces only; it registers no model tool or prompt. Future `drive_*` Tool Consumers own any model-visible file metadata or extracted content.

#### Token effect

Zero direct tokens. Browser metadata snapshots and binary responses never enter model requests by themselves.

#### KV Cache effect

Independent of model requests: Remote calls and browser downloads do not alter a request prefix.

## Known Limitations and Deferred Work

- **Full snapshots after every mutation** — this is intentionally simple and reconnect-safe for the first local library; large multi-user libraries need revisioned deltas or server-side paging.
- **Raw uploads are buffered by the WebServer route** — the route enforces the Drive file cap but does not yet stream directly into a provider transaction; stage 2 retains the 50 MiB default.
- **No multi-range response** — one byte range is supported for PDF and ordinary browser reads; multipart ranges reject with `416`.
- **Pinned PDF.js asset family** — Worker and CMap paths are coupled to `pdfjs-dist@6.2.108`; dependency upgrades must update the versioned Worker path and rerun browser fixtures.
- **Pinned DOCX asset family** — Worker/Runtime paths are coupled to `docx-preview@0.4.0` and `jszip@3.10.1`; upgrades require re-auditing private JSZip metadata used only by Worker preview budgets and rerunning malicious OOXML fixtures.
- **Local browser authentication only** — Connection authentication protects the local Web application; enterprise identity and per-file authorization remain stage 5 work.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The upload route uses a WebServer exact route instead of `connection.fetch` because the current exact Fetch registry admits only `GET` and `HEAD`. It still calls the same Connection rejection method before body intake. If Connection later supports authenticated POST Fetch routes, this adapter can move without changing its public paths.

</details>
