# Agent Note: Safety Agent drive library — replace team collaboration with a standalone document plane

Status: proposed

English | [中文](2026-08-29-safety-agent-drive-library.zh.md)

## Problem

The Buddy fork needs a focused "Positioning Safety Agent" product mode derived from low-altitude safety protocol concepts. The current requirement removes the triangular multi-Agent collaboration experience and replaces it with a standalone drive/library where a user can upload role-assignment documents and Markdown, PDF, and DOCX files, browse them, and preview them online. Messaging, mailboxes, co-editing, lightweight publishing, vector RAG, and multi-user collaboration are outside the first delivery.

No normative document named "low-altitude safety protocol" or an exact definition of the former triangle was found in this repository or the supplied local research files. This proposal therefore treats the phrase as a design constraint rather than a compliance claim: separate the control plane from the document data plane, grant least privilege, keep provenance and audit facts, and fail closed. If an external protocol defines mandatory roles, fields, retention, classification, or approval rules, that document must be supplied before those rules can become acceptance criteria.

## Evidence from the current Harness

The existing packages are useful foundations but none is a drive library:

- [`dsh-workspace`](../../../../packages/workspace/workspace/README.md) records a canonical local directory, title, and ordered Sessions. It does not own files, folders, uploads, previews, or model context.
- [`dsh-attachment`](../../../../packages/attachment/attachment/README.md) is an immutable image-only content-addressed store. Its type surface accepts PNG, JPEG, WebP, and GIF, and the browser attachment UI explicitly has no non-image surface.
- [`dsh-client-ui-deliverables`](../../../../packages/client/ui-deliverables/README.md) derives file paths produced during a Session and opens those workspace paths. It is not an asset registry and cannot represent uploaded library files, folders, versions, or retention.
- [`dsh-storage-domain`](../../../../packages/storage/storage-domain/README.md) is suitable for typed metadata, but the shipped storage backend contract currently exposes key-value documents rather than a large-binary object store.
- [`dsh-host-webserver`](../../../../packages/host/webserver/README.md), the Typert Remote gateway, the Client module loader, and the typed slot system provide the transport and UI extension points needed for a dual-face drive plugin.
- [`dsh-experimental-agent-team`](../../../../packages/experimental/agent-team/README.md) owns a durable roster, task DAG, and mailbox. Those are exactly the collaboration concepts this product mode excludes, so the drive must not depend on or mount the Agent Team packages.

## Proposal

The first product is one human-controlled document library plus one ordinary Harness Agent preset named "Positioning Safety Agent". It is not a Team and has no peer roster, task board, mailbox, or Agent-to-Agent communication. The library is a standalone application surface reached from the sidebar, while conversation remains available as a separate mode.

The low-altitude safety analogy maps to four enforceable rules:

1. **Control plane** — metadata mutations, upload admission, delete, version publication, and Agent write approval are authoritative Host operations.
2. **Data plane** — immutable blobs and generated previews are addressed by opaque ids and are never exposed as user-selected filesystem paths.
3. **Observation plane** — every accepted mutation records actor, operation, target, time, previous version when applicable, and a stable correlation id.
4. **Fail-closed policy plane** — unknown formats, invalid signatures, out-of-quota data, unsafe preview conversion, and unresolved authorization reject without publishing a file record.

## Proposed capability and package boundary

Create a new `drive` capability seam instead of widening Workspace, Attachment, or Deliverables. Fork-owned packages use the `@sospink/dsh-buddy-*` scope under a new `packages/buddy/` group so the fork does not publish under DeepSeek's namespace. The repository constraint gate must allow that scope only in the fork-owned group.

| Package | Responsibility |
|---|---|
| `@sospink/dsh-buddy-drive` | Service Definition, branded ids, entities, errors, event types, limits, and provider-neutral operations on libraries, folders, files, and versions |
| `@sospink/dsh-buddy-drive-local` | Local provider: atomic blob publication, metadata transactions through `ctx.storageDomain`, preview cache, quota accounting, startup validation, and recovery |
| `@sospink/dsh-buddy-api-drive` | Typert Remote metadata commands and reconnect-safe feed; same-origin HTTP upload/content routes for streaming binary data |
| `@sospink/dsh-buddy-client-ui-drive` | Sidebar entry, standalone drive surface, folder tree, file table, upload queue, metadata editor, and preview panel |
| `@sospink/dsh-buddy-tool-drive` | Optional model Consumers: read-only list/search/read in the first release; staged create-version later |
| `@sospink/dsh-buddy-drive-app` | Bundle patch that mounts the Host, Client, controller, and optional tool packages after the stock Web bundle |

`ctx.drive` is the only product-facing Host service. The local provider owns both metadata and media semantics; consumers never call `node:fs`, `ctx.storage.backend`, or a blob directory directly. This keeps a later S3, MinIO, NAS, or enterprise object-storage provider replaceable without changing the UI or Agent tools.

## Durable model

The first release has one default library, arbitrary folders, immutable file versions, and a soft-delete tombstone. Stable ids are generated independently of display names.

```ts
interface DriveFile {
  readonly id: DriveFileId
  readonly libraryId: DriveLibraryId
  readonly parentId?: DriveFolderId
  readonly name: string
  readonly kind: 'role-assignment' | 'safety-protocol' | 'operating-rule' | 'reference' | 'general'
  readonly mediaType: 'text/markdown' | 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  readonly currentVersionId: DriveVersionId
  readonly tags: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
  readonly deletedAt?: string
}

interface DriveVersion {
  readonly id: DriveVersionId
  readonly fileId: DriveFileId
  readonly digest: `sha256:${string}`
  readonly bytes: number
  readonly createdAt: string
  readonly actor: 'human' | 'agent'
  readonly source: 'upload' | 'agent-publication'
  readonly preview: 'pending' | 'ready' | 'unsupported' | 'failed'
}
```

Metadata uses a versioned `buddy_drive` storage domain. Binary data lives outside the Web root under `$DSH_HOME/buddy-drive/blobs/sha256/<prefix>/<digest>` and is published by temporary-file write, `fsync`, digest verification, and atomic rename. Original names exist only as metadata. Derived preview artifacts use a separate cache keyed by source digest, renderer name, renderer version, and policy revision, so a library upgrade cannot silently reuse an incompatible preview.

Duplicate bytes may share one blob, but each upload creates its own version record and audit fact. Delete removes the visible file record first and garbage-collects unreferenced blobs asynchronously after a retention window; it never deletes an arbitrary workspace path.

## Transport and UI composition

Metadata methods such as list, create-folder, rename, move, classify, delete, restore, and version history use Typert Remote. Binary upload must not be base64 inside Remote JSON because that duplicates memory and defeats streaming. The Host registers same-origin routes for upload and content, with exact method checks, bounded request streams, cancellation, and deterministic errors.

The content route accepts an opaque file/version id and supports `GET`, `HEAD`, and byte ranges for PDF.js. It emits a verified media type, `Content-Disposition: inline` with a separately encoded display filename, `X-Content-Type-Options: nosniff`, a restrictive content security policy, and private/no-store caching until an explicit cache policy exists. It never accepts a filesystem path.

The stock layout already declares a `sidebar.footer.action` list and a `shell.overlay` surface. The drive plugin should register a "Document Drive" action in the sidebar and open a full application overlay instead of replacing the single-owner Workspace slot or rewriting the root shell. The overlay contains a folder column, a sortable/searchable file table, and a preview column. Closing it returns to the unchanged conversation. This provides a genuinely separate drive mode while keeping the change isolated from upstream layout code.

## Preview pipeline

### Markdown

Decode only validated UTF-8 text and render with the existing [`MarkdownText`](../../../../packages/client/ui-primitives/src/markdown/MarkdownText.tsx) primitive. It already renders untrusted Markdown as React elements with raw HTML, relative links, and unsafe protocols disabled. The drive wrapper also disables remote images by default; a later policy may allow an explicit host allowlist. Source view and rendered view are separate tabs.

### PDF

Use a fork-owned, re-skinned PDF.js viewer over the ranged content route. PDF.js provides the display and viewer layers and accepts raw binary or URL-backed files; page virtualization prevents rendering an entire long document at full resolution. The preview runs without JavaScript embedded in the source PDF, external URL actions require an explicit user click, and download remains a separate authorized command.

### DOCX

Use `docx-preview` for the visual preview in a sandboxed iframe or isolated document. Configure `renderAltChunks: false`, forbid external resource fetching, rewrite object URLs on disposal, restrict link protocols, cap ZIP entries and decompressed bytes before rendering, and terminate preview work on timeout. Its stable `renderAsync` entry renders DOCX into HTML while retaining more page layout than plain semantic conversion.

Separately, run Mammoth in a bounded worker to extract sanitized semantic HTML or plain text for search and Agent reads. Mammoth explicitly does not sanitize its output and warns about external-file and pathological-performance risks, so its output must pass a strict sanitizer, `externalFileAccess` remains disabled, and the worker has CPU/time/memory limits. Mammoth output is not the primary visual preview.

## Upload and preview security

The first release accepts only `.md`, `.markdown`, `.pdf`, and `.docx`; ZIP, HTML, SVG, executable formats, macro-enabled Office formats, legacy `.doc`, and arbitrary extension fallback reject. The browser-declared MIME type is advisory only. Admission validates the normalized extension, magic/signature, and container structure: PDF begins with a valid PDF signature, DOCX is an OOXML ZIP containing expected Word entries, and Markdown is valid bounded UTF-8 without binary control density.

Defaults are 50 MiB per file, 2 GiB per library, four concurrent uploads per browser, a bounded request timeout, a maximum DOCX entry count, a maximum expanded byte total, and a maximum compression ratio. All values are deployment configuration and are rechecked by the Host. Storage filenames are generated ids/digests, not user text. Preview parsers run outside the main event loop in workers or isolated subprocesses and never receive a writable workspace path.

The Web bundle remains loopback-only for the first delivery. Harness's Web server carries no authentication or TLS of its own when bound to `0.0.0.0`; therefore LAN exposure is not accepted merely by adding a trusted Host. A later network deployment requires an authenticated reverse proxy, TLS, user identity, authorization checks on every command and content request, CSRF protection, and tenant-scoped storage before it can claim to be a cloud service.

Uploaded documents are untrusted model data. Nothing is automatically injected into the Agent prompt. A user explicitly selects files or the Agent calls a bounded read/search tool; results carry file id, version id, name, classification, and source markers, and system instructions state that document text is evidence rather than executable instructions. The first Agent tool set is read-only. Agent publication later writes a staged new version that a human approves; it never overwrites the current version directly.

## Third-party plugin assessment

The community catalog contains useful references, but none is a direct production baseline for this requirement.

| Candidate | Useful evidence | Why it is not installed as the drive |
|---|---|---|
| `dsh-files` 0.4.0, declared MIT | Demonstrates composer upload, content sniffing, PDF/DOCX/XLSX extraction, quotas, and a `read_document` tool | Files are Session-isolated temporary workspace assets under `.dsh-filess`, TTL-based, and coupled to conversation intake; it has no global library, folder model, version history, standalone UI, or durable governance |
| `dsh-file-explorer` 0.1.3, package declares MIT | Demonstrates a file tree, Markdown/text preview, and `shell.overlay` integration | It is a broad workspace file browser/editor with write and VS Code launch routes, accepts paths, and the inspected repository does not include a tracked license file; that is the opposite of an opaque-id, read-mostly document plane |
| `dsh-univer-office` 0.2.10, Apache-2.0 | Rich Office import, live editing, drafts, review, and export | It is a much larger office-authoring runtime, includes Pro/native/gateway dependencies, and pins older exact Harness peers; the current requirement is upload and preview, not Office editing or multi-Agent worktrees |
| `@huanlin/dsh-plugin-mineru` 0.2.4, AGPL-3.0 | Document-to-Markdown parsing can improve later indexing | It adds an external parsing workflow and strong copyleft obligations but does not supply the drive data model or primary browser; legal, deployment, and data-egress review are required before reuse |

The recommended reuse policy is to borrow patterns and tests, not copy a whole plugin into the product profile. Any source reuse must record its license and notices, pin a reviewed commit, adapt it behind the new seam, and pass compatibility and security tests against this fork's `0.1.2-alpha.1` baseline.

## Delivery sequence

### Phase 0 — product baseline and threat model

Create `develop` and feature branches, lock the upstream commit, add the fork-owned package scope rule, record the missing low-altitude protocol as an external dependency, and write malicious upload fixtures. Exit when the navigation wireframe, accepted formats, quotas, and loopback-only deployment rule are approved.

### Phase 1 — durable drive core

Implement ids, entities, storage-domain schema, local blob provider, atomic upload admission, folders, list/search metadata, rename/move, soft delete, restore, version history, audit records, and startup recovery. Exit when restart preserves all records, duplicate names and bytes behave deterministically, interrupted writes recover, and path/traversal/symlink tests cannot escape the media root.

### Phase 2 — standalone UI and online preview

Implement the sidebar action, full drive overlay, upload queue, folder/file browsing, metadata classification, Markdown source/rendered views, PDF.js viewing with ranges, DOCX isolated visual rendering, download, and error states. Exit when representative Chinese and English Markdown/PDF/DOCX fixtures preview in Chrome and Safari, large files stay bounded, and a failed preview never loses the original file.

### Phase 3 — Positioning Safety Agent integration

Add the Agent preset and read-only `drive_list`, `drive_search`, and `drive_read` tools with explicit selection, provenance, output budgets, and prompt-injection framing. Do not mount Agent Team roster/task/mailbox or communication UI. Exit when the Agent can answer from selected role documents, cites file/version provenance, cannot mutate the drive, and no document is injected without a user action or tool call.

### Phase 4 — hardening and optional knowledge retrieval

Add antivirus/CDR integration points, authenticated reverse-proxy deployment, authorization roles, retention policy, metrics, backups, and full-text indexing. Vector embeddings and RAG begin only after document-level authorization filtering and deletion propagation are proven; they are not required for the initial cloud-drive effect.

A realistic estimate for one experienced full-stack engineer is five to seven weeks for Phases 0–3 plus review, with a second engineer reducing elapsed time mainly through parallel UI/Host work and security testing. This estimate excludes an enterprise identity system, remote object storage, multi-user sharing, Office editing, OCR, and production RAG.

## Acceptance criteria

- The product exposes a standalone Document Drive mode and no triangular Team, roster, task-board, mailbox, or Agent communication surface in that mode.
- A user can create folders; upload role-assignment, safety-protocol, operating-rule, reference, or general Markdown/PDF/DOCX documents; rename, move, classify, download, soft-delete, restore, and inspect version history.
- Markdown, PDF, and DOCX preview online without opening an external desktop application; preview failure is isolated and leaves the original downloadable.
- All binary routes use opaque ids, exact methods, bounded streams, verified media types, origin/Host checks, and no user-provided filesystem paths.
- Filename traversal, symlink escape, MIME spoofing, double extension, oversized upload, PDF parser failure, DOCX ZIP bomb, external DOCX relationship, and malicious Markdown/HTML fixtures have rejecting or safely rendered tests.
- Restart, interrupted publication, duplicate upload, concurrent upload, quota, range-read, delete/restore, and garbage-collection behavior have Host integration tests.
- Client slot registration, reconnect, upload progress, keyboard navigation, preview loading/error, and narrow-window behavior have focused Client tests and a keyless Web snapshot.
- The Positioning Safety Agent reads only explicitly selected or tool-requested versions, reports provenance, obeys output budgets, and has no direct mutation operation.
- The custom bundle can be disabled without changing stock Harness packages, and upstream `master` can still be fetched and merged with fork-owned code confined to the documented packages and narrow composition changes.

## Alternatives considered

### Extend Attachment to every file type

Rejected because Attachment is a model-message image path with image normalization and request variants. A drive needs folders, classifications, versions, delete/restore, audit, preview derivations, and independent lifetime. Widening Attachment would couple unrelated lifecycles and destabilize upstream model APIs.

### Treat a Workspace folder as the drive

Rejected because workspace paths are user execution areas visible to filesystem tools and shell commands. A governed document library must not inherit arbitrary writes, code execution, editor launch, or path identity. Explicit import/export between a drive and a workspace may be added later as a reviewed command.

### Install `dsh-files` and `dsh-file-explorer` together

Rejected as the target architecture. The combination gives a fast demo but leaves two path-based stores, Session TTL semantics, broad workspace write routes, no authoritative library model, and no coherent retention or audit. Their patterns are valuable for a proof, not as the durable product boundary.

### Adopt Univer as the first preview implementation

Rejected for the first delivery because the authoring, gateway, Pro/native dependency, draft, and review surface greatly exceeds upload-and-preview scope. It remains a later optional editor provider behind a reviewed adapter.

## Risks

- The exact low-altitude safety protocol, former triangle roles, and required role-assignment document fields remain unspecified; the external source must be attached before claiming domain compliance.
- Harness is a developer preview and this fork is currently on `0.1.2-alpha.1`; Client slots and package APIs may move. Fork-owned adapters and pinned integration tests are mandatory.
- DOCX fidelity and safety conflict. Isolated `docx-preview` is the default visual path, but complex documents may differ from Word. A future LibreOffice-to-PDF converter improves fidelity at the cost of a large sandboxed native dependency.
- Local disk plus loopback UI is a personal drive, not a real cloud service. Product naming must distinguish local mode until identity, remote object storage, backup, sharing, and network security exist.
- Full-text extraction can leak restricted text into indexes or logs. Index records must inherit file authorization, versions, deletion, and retention before search expands beyond the local single-user release.
