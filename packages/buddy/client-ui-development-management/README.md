---
description: "Dark acrylic Development Management workspace for requirements, engineering delivery, Agent review, and merge confirmation."
kind: "package"
---

# @sospink/dsh-buddy-client-ui-development-management

English | [中文](README.zh.md)

## Summary

This browser plugin adds the Development Management action to the sidebar and mounts a full-window dark acrylic workspace. Its dense requirement table exposes priority, status, creator, assignee, reviewer, phase, and update time without turning the workflow into a generic card dashboard. Role selection limits the visible workbench and the Host independently enforces every mutation.

Product Managers receive requirement creation, review, assignment, artifact, detail, and history surfaces. Assigned engineers can accept work, upload files or complete browser-selected directories, and submit a required result summary for acceptance. Product Managers review the submission in a focused dialog, approve it, or return it with a required reason. The detail page retains both the latest submission and review outcome. Accepted engineers can then configure a permitted local repository, request and run delivery checks, and inspect file differences, suspected conflicts, command logs, the Agent conclusion, and generated Merge Request text. Only the Product Manager view exposes final confirmation and merged-evidence controls.

## Known Limitations

- Browser directory upload relies on `webkitdirectory`, which is supported by Chromium-based delivery browsers but is not a standards-complete directory-picker API.
- Long check suites remain one attended operation; this version shows busy progress but does not yet stream individual command logs while they run.
- Remote Git credentials and provider settings are deployment configuration and are intentionally absent from the browser UI.
