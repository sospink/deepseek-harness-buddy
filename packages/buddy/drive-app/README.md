---
description: "Optional Buddy Web bundle that mounts the local Drive provider, browser API, and standalone Drive UI after the stock Web layer."
kind: "package-bundle"
---

# @sospink/dsh-buddy-drive-app

English | [中文](README.zh.md)

## Summary

`@sospink/dsh-buddy-drive-app` is the optional Bundle layer for the Buddy product stack. Apply it after `@deepseek-ai/dsh-web-app`; its patch mounts the local Drive provider under `$DSH_HOME/buddy-drive`, the generated Remote and authenticated binary API, the standalone browser UI, the professional Agent-role selector, the Development Management delivery workflow, and the read-only Positioning Safety Agent preset/tool package. Removing this Bundle removes the Buddy rows without changing upstream packages.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Use this package

Add the Bundle to a Web profile after the base and Web bundles:

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@sospink/dsh-buddy-drive-app"
      ]
    }
  }
}
```

The layer uses the stage-one default limits: 50 MiB per file, 2 GiB retained logical bytes, DOCX entry/expansion/ratio bounds, and 100,000 audit events. Override the `buddy-drive-local` row in a later profile patch when deployment policy differs. It also patches the stock `agent-presets` row with a fork-owned read-only system root while restating `default: standard`, `includeShippedRoot: true`, and `includeUserRoot: true`, so official and user presets remain available.

## Understand the implementation

The package contains one `cordis.patch.yml` and a marker Loader plugin. The patch inserts the Drive rows, the Host and Client professional-role rows, and the Host and Client Development Management rows. It also replaces the complete `agent-presets` config to add the tool package's `presets/` directory. Cordis injection orders the Buddy rows behind Storage Domain, WebServer, Connection, Typert, Subprocess, Remote, Locale, and Slot services from the preceding stock layers.

Development Management persists below `$DSH_HOME/development-management`, admits repositories only below `DSH_BUDDY_REPOSITORY_ROOT` (or the launch directory), and runs the configured typecheck, test, and build commands before recommending a merge. The default remote provider is `none`, so a real manually created MR/PR URL remains mandatory until a deployment explicitly configures GitLab.

## Further Exploration

- [Buddy package map](../README.md) — packages mounted by this layer.
- [Delivery TODO](../../../BUDDY_DRIVE_TODO.md) — staged acceptance evidence.
- [Development Management ledger](../../../docs/buddy-development-management-ledger.md) — role workflow and delivery acceptance evidence.

## Model Experience

### Bundle composition

#### What the model sees

The Bundle adds a selectable Positioning Safety Agent preset, a separate professional-role selector, and an attended Development Management delivery Agent. Ordinary/default sessions remain `standard`; only sessions explicitly choosing `positioning-safety` receive the fixed untrusted-evidence persona and three read-only Drive tools. A professional role changes the working method without changing that tool composition. Development Management invokes managed Git and configured checks only when an assigned engineer explicitly requests delivery review.

#### Token effect

Zero tokens for ordinary presets. The Positioning Safety Agent adds its complete persona and the three Drive Tool schemas/results described by `@sospink/dsh-buddy-tool-drive`.

#### KV Cache effect

Ordinary presets are unchanged. The Positioning Safety Agent has a stable complete persona; explicit Drive results append after the cacheable prefix and are version-specific.

## Known Limitations and Deferred Work

- **Local-provider bundle** — this layer selects the local disk provider; remote object-storage deployments need a different bundle or a later row override.
- **Not a shipped upstream profile template** — the Bundle is intentionally optional until the Buddy product profile and branding are accepted.
- **Preview and Agent tools are separate boundaries** — this layer only composes them; browser viewer safety/performance budgets belong to Client UI, while read-only model tools and provenance/replay belong to Tool Drive.
- **Remote merge integration is deployment-owned** — the default layer generates MR content and requires manual URL evidence; automatic GitLab creation/merge requires explicit server, project, and token configuration.

### Dev Note

<details><summary>Working context for maintainers — click to expand</summary>

Keep the Bundle declarative. Product behavior belongs to the mounted packages, not the marker plugin.

</details>
