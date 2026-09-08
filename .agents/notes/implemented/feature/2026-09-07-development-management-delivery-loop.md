# Agent Note: Development management delivery loop

Status: implemented

English | [中文](2026-09-07-development-management-delivery-loop.zh.md)

## Problem

Buddy had professional session identities and a document drive, but no durable handoff from product requirements to discipline-specific engineers and no evidence-backed path from uploaded work to a merge decision. A visual task board alone would imply collaboration without enforcing who may act. A canned “Agent review passed” result would be worse: it could claim a branch was safe without reading Git state, running checks, or obtaining human and remote-system evidence.

## Decision

Buddy ships a separate Development Management Host service and browser workspace. Product Managers create, submit, assign, annotate, and inspect requirements. Blockchain Architect Engineers, Algorithm Engineers, and Agent Application Development Engineers see and mutate only tasks assigned to their matching discipline. The Host owns role authorization and a closed lifecycle from draft through assigned and in-progress work, result acceptance, delivery review, human confirmation, submitted Merge Request, and merged completion.

An engineer must upload at least one result artifact and provide a result summary before submitting for acceptance. The Product Manager then reviews the submitted result, either approving it with an optional comment or returning it with a required reason. Returned tasks reopen engineering upload and resubmission. Only an accepted result may enter the first Agent delivery check; Agent-paused tasks can still retry that check. Submission summaries, decisions, and comments are durable task data and immutable audit events, and the Host enforces every role and status gate independently of the browser UI.

Requirements and prototype documents use an explicit Product Manager format allowlist. Engineering uploads represent complete repositories, so they admit arbitrary regular project files after role, status, path, duplicate-path, per-file, and per-task checks. HTTP request bodies stream to private temporary files, receive a SHA-256 digest, and are revalidated when atomically committed; large model weights do not become whole in-memory values.

The delivery review reads the configured local repository only after its canonical path is proven inside a configured root. Git commands use argument vectors. The Agent records the current branch and working tree, compares `target...source`, computes line counts, finds files changed on both sides since the merge base, and consults `merge-tree` for conflict signals. Configured check, test, and build commands run through the managed subprocess service with time and output limits. The durable report contains all evidence, deterministic MR text, and either `recommend-merge` or `pause-merge`; conflicts, failed checks, or no commit difference cannot recommend merge.

A recommendation reaches only `awaiting-human-confirmation`. The Product Manager must explicitly confirm generated MR content. A configured GitLab integration may then create and later merge the real MR. Without that configuration, the Host requires a valid manual MR URL for submission and a valid merged URL for completion. GitHub automatic creation is not claimed. No branch review, MR submission, or merge state is fabricated.

## Alternatives considered

**Model the workflow as chat prompts and files in the existing Drive.** Rejected because chat has no closed task lifecycle, assignee authorization, atomic audit record, or machine-enforced human confirmation gate.

**Accept only a curated engineering extension list.** Rejected because complete Solidity, Python, frontend, and Java repositories contain assets, wrappers, native files, model sidecars, and extensionless configuration. An allowlist would silently make “upload the complete project” false.

**Return a simulated successful MR when no remote provider is configured.** Rejected because it would misrepresent external state. Manual URL evidence preserves an honest offline demonstration while GitLab configuration enables real automation.

**Let a clean Agent review submit immediately.** Rejected because the product requirement explicitly retains human authority. The state transition into submitted MR remains a Product Manager action even when every automated check passes.

## Consequences

The feature provides an auditable end-to-end collaboration path and real local delivery evidence while staying usable on isolated customer networks. It adds private persistent storage, potentially large artifacts, long-running managed checks, and deployment-owned repository roots. Suspected conflicts remain conservative signals rather than confirmed merge conflicts. Automatic GitHub PR creation, streaming per-command live logs, artifact replacement, and retention policy remain deferred and are described as limitations instead of implied capabilities.
