---
description: "Durable role-aware development tasks, streamed artifacts, real Git delivery review, and merge-request gates."
kind: "package"
---

# @sospink/dsh-buddy-development-management

English | [中文](README.zh.md)

## Summary

This Host package owns Buddy Development Management. Product Managers create, review, assign, and inspect requirements. Discipline-compatible blockchain, algorithm, and Agent-application engineers accept assigned work and upload complete project trees through an authenticated streaming route. Task state, artifact metadata, delivery reports, and audit history are atomically persisted below the configured private root.

Engineers submit uploaded results with a required summary. Product Managers may approve with an optional comment or return the work with a required reason; returned tasks reopen upload and resubmission. Only accepted results may enter the first delivery check. The submission and review remain durable task data and audit history across restarts.

The delivery Agent reads the requirement and a configured local Git worktree, compares source and target refs, reports working-tree and commit differences, flags files changed on both sides as suspected conflicts, and records every configured check command with exit code, bounded output, and duration. It generates a Merge Request draft and concludes either recommend merge or pause merge. A clean result only reaches awaiting-human-confirmation; a Product Manager must explicitly confirm before the task can become merge-request-submitted.

## Security and integration

- Repositories must resolve inside one of `repositoryRoots`; Git receives an argument vector instead of shell text.
- Uploads are streamed to private temporary files, rechecked at commit, bounded per file and task, hashed with SHA-256, and never buffered as one complete `.pt` value.
- Product requirement artifacts use a document/prototype allowlist. Engineering tasks accept complete repository trees because real projects contain assets, wrappers, sidecars, and extensionless files.
- GitLab can create and merge real Merge Requests when URL, project, and token are configured. Without remote integration, confirmation and merge require real HTTP(S) MR/PR URLs; the service never fabricates success.

## Known Limitations

- Automatic GitHub Pull Request creation is not implemented; GitHub deliveries use manual URL evidence.
- Suspected-conflict results are conservative review signals, not a claim that Git has produced a confirmed conflict in the current checkout.
- Artifact files are append-only within a task path in this version; replacement and retention policy are deferred.
