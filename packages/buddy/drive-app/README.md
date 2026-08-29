---
description: "Optional Buddy Web bundle that mounts the local Drive provider, browser API, and standalone Drive UI after the stock Web layer."
kind: "package-bundle"
---

# @sospink/dsh-buddy-drive-app

English | [中文](README.zh.md)

## Summary

`@sospink/dsh-buddy-drive-app` is the optional Bundle layer for the complete Buddy document-drive stack. Apply it after `@deepseek-ai/dsh-web-app`; its patch mounts the local Drive provider under `$DSH_HOME/buddy-drive`, the generated Remote and authenticated binary API, the standalone browser UI, and the read-only Positioning Safety Agent preset/tool package. Removing this Bundle removes the Buddy Drive rows without changing upstream packages.

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

The package contains one `cordis.patch.yml` and a marker Loader plugin. The patch inserts three Drive rows and replaces the complete `agent-presets` config to add the tool package's `presets/` directory. The root resolves through `@sospink/dsh-buddy-drive-app/package.json` and its package-local dependency, so it works whether pnpm nests or hoists `tool-drive`. Cordis injection orders the Drive rows behind Storage Domain, WebServer, Connection, Typert, Remote, Locale, and Slot services from the preceding stock layers.

## Further Exploration

- [Buddy package map](../README.md) — packages mounted by this layer.
- [Delivery TODO](../../../BUDDY_DRIVE_TODO.md) — staged acceptance evidence.

## Model Experience

### Bundle composition

#### What the model sees

The Bundle adds a selectable Positioning Safety Agent preset. Ordinary/default sessions remain `standard`; only sessions explicitly choosing `positioning-safety` receive the fixed untrusted-evidence persona and three read-only Drive tools.

#### Token effect

Zero tokens for ordinary presets. The Positioning Safety Agent adds its complete persona and the three Drive Tool schemas/results described by `@sospink/dsh-buddy-tool-drive`.

#### KV Cache effect

Ordinary presets are unchanged. The Positioning Safety Agent has a stable complete persona; explicit Drive results append after the cacheable prefix and are version-specific.

## Known Limitations and Deferred Work

- **Local-provider bundle** — this layer selects the local disk provider; remote object-storage deployments need a different bundle or a later row override.
- **Not a shipped upstream profile template** — the Bundle is intentionally optional until the Buddy product profile and branding are accepted.
- **Preview and Agent tools are separate boundaries** — this layer only composes them; browser viewer safety/performance budgets belong to Client UI, while read-only model tools and provenance/replay belong to Tool Drive.

### Dev Note

<details><summary>Working context for maintainers — click to expand</summary>

Keep the Bundle declarative. Product behavior belongs to the mounted packages, not the marker plugin.

</details>
