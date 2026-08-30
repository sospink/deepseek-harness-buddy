---
description: "Read-only Buddy Drive model tools: bounded list/search/read, isolated PDF/DOCX extraction, immutable provenance, and replay-safe evidence framing."
kind: "package-reference"
---

# @sospink/dsh-buddy-tool-drive

English | [中文](README.zh.md)

## Summary

`@sospink/dsh-buddy-tool-drive` is the optional model-facing Consumer of `ctx.drive`. It registers only `drive_list`, `drive_search`, and `drive_read`, adds prompt-injection guidance, and ships the Positioning Safety Agent preset that mounts those tools under a scope-only inherited-tool deny policy. The package exposes no mutation tool and never accepts a filesystem path.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Use this package

Mount the main entry only inside an Agent preset. `drive_list` returns current non-deleted metadata without reading document content. `drive_search` searches metadata first, then inspects a bounded number of current immutable versions. `drive_read` requires both an exact File ID and Version ID from list/search, verifies ownership, and returns a line-addressed window.

Markdown text decodes on the Host. PDF.js and Mammoth extraction run in a one-shot Node Worker with source-byte, extracted-text, heap, wall-time, and cancellation bounds. Mammoth uses `extractRawText`; HTML conversion and `externalFileAccess` are never enabled. Search reports skipped/unextractable files instead of claiming complete coverage.

Every rendered search/read result labels the document as untrusted evidence and includes Name, File ID, Version ID, digest, classification, media type, folder path, and tags. Harness snapshots that exact model-facing text into `tool/result`, so replay reconstructs the version and text window the model saw without a new Session event vocabulary.

## Understand the implementation

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Tool schemas, config, prompt guidance, list/search/read execution, and DTO/render budgets |
| [`src/catalog.ts`](src/catalog.ts) | Bounded folder traversal, current-version relation checks, and stable folder paths |
| [`src/extract.ts`](src/extract.ts) | One-shot Worker lifecycle, source/heap/time budgets, cancellation, and result validation |
| [`src/worker.ts`](src/worker.ts) | PDF.js and Mammoth pure extraction plus the Worker entry |
| [`src/budget.ts`](src/budget.ts) | UTF-8, JSON, item, and line-window budgeting |
| [`src/render.ts`](src/render.ts) | Stable provenance and untrusted-evidence envelopes persisted in `tool/result` |
| [`src/policy.ts`](src/policy.ts) | Scope-only empty allowlist for every inherited/global tool |
| [`presets/positioning-safety/`](presets/positioning-safety/) | Positioning Safety Agent composition and picker metadata |

## Further Exploration

- [Drive Service Definition](../drive/README.md) — provider-neutral file/version authority.
- [Buddy Drive Bundle](../drive-app/README.md) — installs the package and adds its preset root.
- [Delivery TODO](../../../BUDDY_DRIVE_TODO.md) — phase acceptance and remaining hardening.

## Model Experience

### Read-only governed evidence

#### What the model sees

The model sees three tool schemas plus a fixed prompt section. No library metadata or document content enters a request until the model explicitly calls a Drive tool. A successful `drive_read` result contains the untrusted-evidence boundary, immutable provenance, truncation facts, and the selected text window verbatim.

#### Token effect

The fixed guidance contributes a small stable system-prompt section. Each tool result contributes only the bounded catalog rows, search snippets, or read window selected by the call; defaults cap rendered output at 48 KiB and the canonical value at 64 KiB.

#### KV Cache effect

The fixed prompt section is cache-stable for the preset. Tool results append after the cached prefix and vary by File ID, Version ID, digest, and selected text. No automatic document injection invalidates the request prefix.

## Known Limitations and Deferred Work

- **Current-version search only** — search inspects each visible file's current immutable version; historical-version search requires an explicit future Consumer.
- **Linear bounded search** — the first local release scans at most 100 files per call and reports skipped/truncated coverage. Indexed search remains stage 5 work.
- **Plain-text extraction** — PDF page markers and Mammoth raw text preserve evidence text, not visual layout, tables, or exact pagination semantics. The browser preview remains the visual authority.
- **No OCR** — scanned PDFs without embedded text are unextractable and are reported as skipped/search misses.
- **No mutation surface** — create-version, rename, move, classify, delete, restore, and publication are intentionally absent.
- **Mammoth dependency review** — `mammoth@1.12.2` is exact-pinned and listed in the repository supply-chain exception because it was fresh at installation time; upgrades require renewed license/security and extraction-fixture review.

### Dev Note

<details><summary>Working context for maintainers — click to expand</summary>

Keep the rendered provenance envelope and the canonical DTO budgets aligned. Do not add a path argument, implicit-current read, automatic prompt injection, or custom Session event: the ordinary durable `tool/result` is the replay contract.

</details>
