---
description: "Provider-neutral Buddy document-drive service: library, folder, file, immutable-version, audit, limits, and verified content-read contracts."
kind: "package-reference"
---

# @sospink/dsh-buddy-drive

English | [中文](README.zh.md)

## Summary

`@sospink/dsh-buddy-drive` is the Service Definition for the Buddy document-drive capability. It owns the provider-neutral vocabulary and `ctx.drive` contract for one library, an acyclic folder tree, logical files, immutable versions, mutation audits, admission limits, and verified version reads. It performs no IO and chooses no filesystem, database, object store, HTTP transport, browser preview, Agent tool, retention schedule, identity model, or sharing policy.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Use this package

Consumers inject `drive` and operate only through `ctx.drive`. They never receive a provider path or blob URL. The first-release contract supports folder creation/rename/move, file import/version/rename/move, soft delete/restore, stable listings, version history, recent audit reads, and verified immutable content reads.

A logical file has one stable `DriveFileId`; every accepted content mutation creates a distinct `DriveVersionId` and advances `currentVersionId`. `DriveDigest` is a SHA-256 content identity, not a bearer capability. `ImportDriveFileInput.idempotencyKey` is an optional stable caller-owned key for new-file imports: a provider may replay the first committed file for the same request, while a different request under the same key must be rejected as a conflict. `DriveMutationContext` carries trusted actor attribution and an optional correlation id; providers mint the missing correlation id.

### Error handling

Providers throw `DriveError` with a stable `DriveErrorCode`. Callers branch on `code`, not diagnostic text. Business misses, duplicate names, idempotency conflicts, invalid moves, quotas, unsupported documents, and durable integrity failures remain distinct.

## Understand the implementation

The package is types plus one abstract Cordis `Service`. ID factories are zero-cost string brands. No service method exposes a host path, mutable provider entity, or transport-specific value. Returned arrays and snapshots are provider-owned immutable projections; a provider must copy caller-owned binary input before any asynchronous queue can observe it.

## Further Exploration

- [Local provider](../drive-local/README.md) — the first durable metadata and blob implementation.
- [Buddy package map](../README.md) — fork-owned package scope and repository position.
- [Safety Agent drive proposal](../../../.agents/notes/proposed/feature/2026-08-29-safety-agent-drive-library.md) — rejected alternatives, security policy, and delivery phases.

## Model Experience

### Drive state and content

#### What the model sees

Nothing directly. `ctx.drive` registers no prompt and no tool; future consumers may expose bounded `drive_list`, `drive_search`, or `drive_read` results carrying file and version provenance.

#### Token effect

Zero direct tokens. A model-facing Consumer owns every token derived from `DriveFile`, `DriveVersion`, or document content.

#### KV Cache effect

Independent of requests: this Service Definition never changes a model-request prefix; a future Consumer owns cache effects from its schemas and results.

## Known Limitations and Deferred Work

- **One default library in the first product** — the vocabulary carries `DriveLibraryId`, but the first Provider exposes one library and no create/delete-library operation.
- **No authorization subject in the seam yet** — the local loopback product has one trusted human context; network and multi-user providers require a reviewed identity and authorization extension before use.
- **No preview or search API** — browser previews, extracted text, full-text indexes, and RAG are separate Consumers or providers and must preserve file/version deletion and authorization semantics.
- **No hard-delete operation** — soft delete/restore is public; retention and garbage collection remain provider policy so shared immutable versions cannot be removed by an ordinary caller.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The API intentionally keeps Agent publication as `createVersion` with `source: 'agent-publication'`; the first Agent Consumer is read-only and must not expose that operation until human approval semantics exist.

</details>
