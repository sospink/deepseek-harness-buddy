---
description: "Local Buddy Drive provider: atomic metadata, private content-addressed blobs, Markdown/PDF/DOCX admission, quotas, audit, restart verification, and orphan recovery."
kind: "package-reference"
---

# @sospink/dsh-buddy-drive-local

English | [中文](README.zh.md)

## Summary

`@sospink/dsh-buddy-drive-local` implements `ctx.drive` on one Host. It commits the complete metadata relation through the `buddy_drive` Storage Domain global and stores immutable source bytes under a private SHA-256 object tree. It admits Markdown, PDF, and DOCX on the Host, enforces quotas and sibling-name/tree invariants, records mutation audits, verifies every referenced blob during startup, and removes temporary or unreferenced provider-owned objects.

## Use this package

Mount the Storage hub and Domain data form first, then mount `LocalDriveStore` with a private root outside every Agent Workspace:

```yaml
- name: '@sospink/dsh-buddy-drive-local'
  config:
    root: /private/dsh-home/buddy-drive
```

Configuration sets encoded file bytes, total retained version bytes, DOCX entry/expanded-byte/compression-ratio limits, and maximum audit events. Defaults are 50 MiB per file, 2 GiB retained logical bytes, 2,000 DOCX entries, 250 MiB DOCX expanded bytes, compression ratio 100, and 100,000 audits.

### Admission

Names are display-only single segments, at most 255 UTF-8 bytes. Visible folders and files share one case-insensitive sibling namespace. `.md`/`.markdown` must be bounded valid UTF-8 without NUL or binary-signature spoofing. `.pdf` must carry a valid `%PDF-x.y` header. `.docx` must be an OOXML ZIP with `[Content_Types].xml` and `word/document.xml`; unsafe member paths, excessive entries or expansion, suspicious ratios, VBA, AltChunk, external relationships, and macro-enabled content reject. Browser-declared media types are advisory and must agree when specific.

### Commit and recovery

Every mutation is serialized. The provider copies caller bytes, validates and publishes a private content-addressed object, then commits one complete metadata state. A failed metadata write leaves the prior in-memory and durable state authoritative; an unreachable object may remain and is removed on the next startup. Startup rejects missing, corrupt, symlinked, malformed, or unexpectedly permissioned referenced storage rather than treating corruption as an empty drive.

Blob publication writes and synchronizes an owner-only temporary inode, hard-links it into the final digest path without replacing an existing entry, removes the temporary name, and synchronizes the containing directory. Existing objects must be regular non-symlink files whose length and digest match.

## Understand the implementation

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Service lifecycle, metadata operations, atomic state commit, quotas, audit, and graph validation |
| [`src/spec.ts`](src/spec.ts) | Zod durable state and `buddy_drive` Domain declaration |
| [`src/admission.ts`](src/admission.ts) | Name/tag normalization and Markdown/PDF/DOCX authoritative admission |
| [`src/blob.ts`](src/blob.ts) | Private content-addressed publication, reads, verification, startup reconciliation, and injectable filesystem failure boundary |
| [`src/state.ts`](src/state.ts) | Cordis-free complete metadata-relation validation used at startup and every commit |
| [`src/ordering.ts`](src/ordering.ts) | Stable name/id and timestamp/id projection ordering |
| [`src/invariant.ts`](src/invariant.ts) | Package invariant ownership; complete-state validation is enforced by the provider |

## Further Exploration

- [Drive Service Definition](../drive/README.md) — provider-neutral public contract.
- [Buddy package map](../README.md) — fork-owned package family.
- [Safety Agent drive proposal](../../../.agents/notes/proposed/feature/2026-08-29-safety-agent-drive-library.md) — product/security rationale and later UI/preview phases.

## Model Experience

### Local drive state and source bytes

#### What the model sees

Nothing directly. This Provider registers no prompt or tool and returns source bytes only to an explicit `ctx.drive.readVersion` caller; a future tool Consumer must bound and attribute any model-visible projection.

#### Token effect

Zero direct tokens. Local metadata and blobs never enter a model request by themselves.

#### KV Cache effect

Independent of requests: metadata commits and blob publication do not alter a request prefix; a model-facing Consumer owns any later invalidation.

## Known Limitations and Deferred Work

- **Single-process metadata authority** — Storage Domain change events are in-process; two Hosts must not open the same local root concurrently.
- **Logical-byte quota counts every version** — equal digests share disk bytes but each immutable version counts toward retained logical bytes, preventing deduplication from bypassing policy.
- **Soft-deleted versions remain retained** — the first Provider exposes restore and startup orphan cleanup, not a retention-window hard-delete scheduler.
- **DOCX admission is structural, not malware scanning** — VBA, AltChunk, external relationships, expansion abuse, and common spoofing reject, but antivirus/CDR remains a later Provider seam.
- **POSIX owner checks are local-user checks** — Windows uses regular-file/non-symlink checks but does not yet enforce an equivalent ACL contract.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The complete metadata document intentionally favors atomicity and explicit recovery over large-library scale. Before splitting it into tables, introduce a storage transaction contract and prove that file/version/audit relations cannot partially commit.

</details>
