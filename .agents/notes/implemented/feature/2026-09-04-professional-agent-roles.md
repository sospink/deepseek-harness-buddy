# Agent Note: Professional agent roles

Status: implemented

English | [中文](2026-09-04-professional-agent-roles.zh.md)

## Problem

Buddy's Agent preset selector answers which tools, permissions, and plugins a session runs, but it does not express the professional discipline a person wants the Agent to apply. Product discovery, prototyping, architecture, AI engineering, blockchain engineering, and code review require materially different working methods. A display-only label would misrepresent model behavior, while an unlogged prompt toggle would disappear on reload, resume, and fork.

## Decision

Buddy adds a product-owned professional-role catalog with General Agent, Business Requirements Analyst, Product Solution Designer, Prototype Designer, Software Architect, AI Application Engineer, Blockchain Engineer, and Code Review Expert. The blank-session Hero places a grouped role selector beside Workspace and Agent preset. Product, Technology, and Quality labels make the catalog scannable; concise descriptions explain what each role changes.

Role and preset are orthogonal. The preset continues to own tools, permissions, and plugin composition. The role owns a stable professional working-method paragraph in dynamic model context. Selection appends the whole-value `agent-role/selected` event, and the `agentRole` projection supplies cold session lists and browser restoration. New sessions explicitly record `general`; legacy logs without a role fold to the same default.

A selection may be staged before a workspace creates the blank session, then is committed as soon as that session becomes current. The Host rejects unknown roles and any change after the first `turn/start`. This prevents one transcript from silently changing professional rules and keeps the request prefix stable for KV caching. Complete persona presets retain their existing authority to suppress runtime contexts; their safety contract is not weakened by a role selector.

## Alternatives considered

**Encode each role as an Agent preset.** Rejected because it creates a combinatorial set of duplicated tool compositions and prevents useful combinations such as Standard + Prototype Designer or Read-only + Code Review Expert.

**Keep the selection only in browser state.** Rejected because the model would not reliably receive it and refresh, resume, or fork would lose the session's professional identity.

**Allow switching during an active conversation.** Rejected because earlier turns would have been produced under a different method, making replay and later answers internally inconsistent.

## Consequences

Each ordinary specialized session receives one short, stable runtime-context contribution; General Agent has zero token effect. The selection is auditable and replayable through the session log. The initial catalog is intentionally fixed in product code; custom role authoring and a settings management surface remain future work.
