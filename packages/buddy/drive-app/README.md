---
description: "Optional Buddy Web bundle that mounts the local Drive provider, browser API, and standalone Drive UI after the stock Web layer."
kind: "package-bundle"
---

# @sospink/dsh-buddy-drive-app

English | [中文](README.zh.md)

## Summary

`@sospink/dsh-buddy-drive-app` is the optional Bundle layer for the complete Buddy document-drive stack. Apply it after `@deepseek-ai/dsh-web-app`; its patch mounts the local Drive provider under `$DSH_HOME/buddy-drive`, the generated Remote and authenticated binary API, and the standalone browser UI. Removing this Bundle removes the Buddy Drive rows without changing upstream packages.

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

The layer uses the stage-one default limits: 50 MiB per file, 2 GiB retained logical bytes, DOCX entry/expansion/ratio bounds, and 100,000 audit events. Override the `buddy-drive-local` row in a later profile patch when deployment policy differs.

## Understand the implementation

The package contains one `cordis.patch.yml` and a marker Loader plugin. The patch inserts three rows: `buddy-drive-local`, `buddy-api-drive`, and `buddy-client-ui-drive`. Cordis injection orders them behind Storage Domain, WebServer, Connection, Typert, Remote, Locale, and Slot services from the preceding stock layers.

## Further Exploration

- [Buddy package map](../README.md) — packages mounted by this layer.
- [Delivery TODO](../../../BUDDY_DRIVE_TODO.md) — staged acceptance evidence.

## Model Experience

### Bundle composition

#### What the model sees

Nothing directly. The `@sospink/dsh-buddy-drive-app` Bundle mounts document storage and browser surfaces; the first mounted packages register no model tool or prompt.

#### Token effect

Zero direct tokens.

#### KV Cache effect

Independent of model requests; later Drive Tool Consumers own their request effects.

## Known Limitations and Deferred Work

- **Local-provider bundle** — this layer selects the local disk provider; remote object-storage deployments need a different bundle or a later row override.
- **Not a shipped upstream profile template** — the Bundle is intentionally optional until the Buddy product profile and branding are accepted.
- **Preview and Agent tools are separate phases** — this layer currently mounts file management; document viewers and read-only model tools land in later changes.

### Dev Note

<details><summary>Working context for maintainers — click to expand</summary>

Keep the Bundle declarative. Product behavior belongs to the mounted packages, not the marker plugin.

</details>
