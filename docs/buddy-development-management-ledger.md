---
description: "Acceptance ledger for Buddy development management, role workflow, artifacts, delivery checks, and merge requests."
kind: "project-plan"
---

# Buddy Development Management Acceptance Ledger

English | [中文](buddy-development-management-ledger.zh.md)

This ledger is the single acceptance status source for the Development Management feature requested on 2026-09-07. “Accepted” requires a browser walkthrough in the delivery environment; source or unit completion alone does not qualify.

| Clause | Requirement | Page/function | Route/API | Backend | Permission boundary | Acceptance action | Status |
|---|---|---|---|---|---|---|---|
| DM-01 | Add the sidebar function named Development Management | Sidebar action and full workspace | `developmentManagement.baseline` | Durable service | Any configured role may read | Open the workspace from both wide and collapsed sidebar | Accepted in local browser |
| DM-02 | Product Manager creates, assigns, and inspects requirements | Requirement list, create form, detail and history | `createTask`, `submitReview`, `assignTask`, `addNote` | Atomic JSON state plus audit | Host enforces Product Manager writes | Create, review, assign, refresh, and observe retained state/history | Accepted in local browser |
| DM-03 | Product Manager uploads PNG, PDF, HTML, and requirement/prototype files | Detail artifact section and file picker | `POST /api/buddy/development-management/upload` | Private streamed files plus metadata | Host rechecks Product Manager and task state | Upload each required type and download it after refresh | Accepted by local automation |
| DM-04 | Blockchain Architect Engineer receives tasks and uploads repositories and `.sol` files | Role-filtered task workbench | Same upload route plus task lifecycle Remotes | Streamed directory files | Only the discipline-compatible assignee may mutate | Receive a blockchain task, upload a directory with `.sol`, and persist it | Accepted by local automation |
| DM-05 | Algorithm Engineer receives tasks and uploads Python projects and `.pt` weights | Role-filtered task workbench | Same upload route plus task lifecycle Remotes | `.pt` streams to disk without whole-file buffering | Only the algorithm assignee may mutate | Upload a Python project and `.pt`, then verify persistence and download | Accepted by local automation |
| DM-06 | Agent Application Development Engineer receives tasks and uploads frontend and Java repositories | Role-filtered task workbench and collapsible file tree | Same upload route plus task lifecycle Remotes | Streamed directory files with `.git` filtering | Only the application assignee may mutate | Receive an application task, upload frontend/Java trees, collapse them, and retain them after reload | Accepted in local browser and automation |
| DM-06A | Engineers submit completed results and Product Managers accept or return them | Submit Acceptance and Review Results dialogs, retained acceptance section | `submitAcceptance`, `reviewAcceptance` | Durable submission/review fields plus audit events | Assignee submits; Product Manager approves or returns; accepted state gates first Agent check | Prove files and summary are required, return with a reason, resubmit, approve, reload, and verify the Agent check is unlocked only after approval | Accepted in local browser and automated Host/component scenarios |
| DM-07 | Agent reads the task and current code changes and compares target/current branches | Delivery configuration and report | `configureDelivery`, `runDeliveryCheck` | Managed real Git subprocesses | Repository must be inside configured roots | Select real refs and see `status`, branch and three-dot diff evidence | Accepted against a local real repository |
| DM-08 | Agent identifies suspected conflicts with causes and suggestions | Report conflict section | `runDeliveryCheck` | `merge-base`, dual changed-file sets and `merge-tree` | Same repository policy | Create overlapping branch changes and inspect the reported risk | Accepted by automated real-Git scenario |
| DM-09 | Agent simulates code checks, tests, and builds and generates a delivery result | Report checks and logs | `runDeliveryCheck` | Configured real commands with timeout and bounded logs | Only assigned engineer can request/run | Observe actual command, exit code, output and persisted conclusion | Accepted in local browser |
| DM-10 | Agent generates MR content and recommends merge or pause | MR draft and conclusion | `runDeliveryCheck` | Evidence-derived report | Failed/no-diff/conflicted checks cannot recommend merge | Compare generated title/body and conclusion with evidence | Accepted in local browser and automation |
| DM-11 | Human confirmation is required before Submitted MR state | Confirmation control | `confirmMergeRequest` | Hard state-machine gate and audit | Product Manager only | Prove missing integration/URL fails, then confirm after a clean report | Accepted in local browser |
| DM-12 | Agent participates in PR/MR review and merge | Submitted/merged controls | `confirmMergeRequest`, `mergeTask` | GitLab API when configured; otherwise manual URL evidence | Product Manager confirmation and merge evidence required | Complete the manual-URL flow through merged and reload; verify GitLab API contract | Local manual flow accepted; customer intranet GitLab pending onsite configuration |

## Acceptance levels

- Platform implementation means the visible entry, real persistence or subprocess/service path, Host permission checks, and repeatable automated coverage exist.
- Live external integration remains pending until a target GitLab or GitHub server, project, token, and network path are configured and exercised.
- Accepted means all applicable actions above are completed in the customer delivery environment with screenshots and retained state.

## 2026-09-07 local acceptance evidence

- Browser E2E completed for task `#1 E2E Low-altitude Alert Delivery Loop`: Product Manager create/review/assign, engineer accept and directory upload, real `feature/alert-delivery → main` comparison, typecheck/test/build execution, MR draft generation, human submission confirmation, and final merged state.
- Submission without a configured integration or URL was rejected with `integration-not-configured`; service coverage proves missing merge evidence is rejected with `merge-evidence-required`.
- After a full page reload, task `#1` remained merged and retained its file tree, delivery report, MR content, and human-confirmation audit entries.
- Task files render as a progressively collapsible repository tree with uploader role, size, and download action. New uploads exclude `.git`, and legacy `.git` artifacts are hidden from the tree.
- Development Management Host/Client type checking and focused lint passed. All 16 tests in 4 test files passed, including the four-role PNG/PDF/HTML, `.sol`, Python/`.pt`, and frontend/Java file matrix. Both `build:lib:host` and `build:lib:client` passed.
- Live customer-intranet GitLab creation/merge still requires the onsite base URL, project and token. Current evidence covers the GitLab HTTP contract plus the local manual-URL flow, not customer-environment acceptance.

## 2026-09-08 result-acceptance evidence

- Browser walkthrough completed for task `#2 Result Acceptance Flow Demo`: Product Manager review/assignment, engineer acceptance and result upload, required result-summary submission, Product Manager review, approval, and full-page reload.
- The empty engineer submission dialog showed zero result files and disabled submission. After upload, the task entered pending acceptance and retained both its summary and audit event.
- The Product Manager review dialog displayed the submitted summary, kept Return for Changes disabled until a reason was entered, and allowed approval. After reload, approved state, comment, artifact tree, and audit history remained visible while the Review Results action was gone.
- Focused Host/Client type checking, lint, 19 tests across 4 files, and both Host/Client library builds passed.
