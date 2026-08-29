# Agent Note: local Drive backup and restore

Status: proposed

English | [中文](2026-08-30-local-drive-backup-restore.zh.md)

## Problem

The Buddy Drive currently persists metadata and source blobs on one local Host, but it has no provider-owned way to produce a verifiable backup or restore one after a Host replacement. Copying the Drive directory is insufficient because metadata lives in the Storage Domain while blobs live under a separate provider root. A partial copy, a changed blob, a symlink, or a stale metadata document must not be accepted as a restorable library.

The current product is a single-library local deployment. It does not yet have enterprise identity, tenant ownership, remote object storage, encryption-key management, or an external backup scheduler. The next stage therefore needs a local, explicit maintenance capability with a narrow promise: a complete backup can be independently checked and restored atomically into another local Drive root.

## Proposal

The local provider writes a versioned backup directory containing `manifest.json`, `metadata.json`, and the referenced content-addressed objects under `blobs/sha256/<prefix>/<digest>`. The manifest records the format version, library id, creation time, exact metadata digest and byte count, every unique blob digest and byte count, and aggregate counts. The metadata file preserves the complete `buddy_drive` state, including local idempotency audit fields; the manifest digest covers the exact serialized bytes.

Backup creation first validates the in-memory state and every referenced source blob, writes into a private temporary sibling directory, synchronizes files and directories, writes the manifest last, and atomically renames the temporary directory to a destination that did not already exist. The destination cannot be the Drive root or a descendant of it. Generated directories are owner-only and generated files are regular, non-symlink files.

Restore validates the complete source directory before changing the target Drive: directory entries must match the manifest, metadata and every listed blob must match their declared digest and byte count, the metadata relations must satisfy the provider limits, and no extra object is accepted. A non-empty target refuses restore unless the caller explicitly requests replacement. Blob publication happens before the metadata commit; the commit adds one `library/restore` audit event and retains the restored files, versions, and idempotency records. A failure before the commit leaves the target metadata unchanged; any newly published but unreferenced objects are removed by the provider's existing startup reconciliation.

The stage defines retention as explicit preservation: all immutable versions remain in the backup and local provider until a later reviewed retention policy exists. No automatic hard deletion, pruning, encryption, off-site replication, or browser arbitrary-path control is introduced here.

## Alternatives considered

**Copy the Drive root only.** Rejected: the metadata document belongs to the Storage backend root, so a root copy cannot restore the library relation or audit history.

**Copy the Storage Domain file and blob tree without a manifest.** Rejected: there is no single digest-covered statement of which metadata and content belong together, and a stale or partial copy could be mistaken for a valid backup.

**Replace the target before validating all backup content.** Rejected: a malformed or truncated backup could destroy a healthy local library before the failure is observed.

**Expose backup and restore through the browser UI with arbitrary paths.** Rejected: browser input is not an appropriate authority for host filesystem paths; maintenance paths remain an explicit local operation until a reviewed operator surface exists.

**Add automatic version pruning now.** Rejected: no retention period, legal hold, recovery point objective, or approval owner has been supplied, so deleting immutable versions would be an unsupported data-loss policy.

## Acceptance criteria

- A generated backup contains a versioned manifest, exact metadata digest, and one verified object for every referenced unique blob.
- A fresh local provider can validate and restore the backup with file, version, audit, and idempotency relations intact.
- Missing, corrupt, modified, symlinked, path-traversal, version-mismatched, and redundant backup entries fail before target metadata changes.
- Export never overwrites an existing destination or writes below the Drive root.
- Restore refuses a non-empty target by default; explicit replacement commits only after complete validation.
- A failed restore leaves the previous target metadata and visible content unchanged.
- The local provider retains all immutable versions and does not claim encrypted, off-site, enterprise, or multi-tenant backup.

## Risks

- The backup directory is a local maintenance artifact, not encrypted storage or an off-site disaster-recovery system. Operators must protect its directory and host volume.
- A source directory changed by another process during restore is outside the single-process provider authority; maintenance tooling must use a quiescent source.
- Existing old orphan blobs may remain after an explicit replacement if post-commit cleanup encounters an unexpected filesystem entry; startup reconciliation remains the recovery owner.
- Enterprise retention, encryption, identity, tenant isolation, scheduling, and remote object storage remain separate stages and require external deployment inputs.
