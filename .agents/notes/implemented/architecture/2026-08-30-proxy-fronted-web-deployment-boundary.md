# Agent Note: proxy-fronted Web deployment boundary

Status: implemented

English | [中文](2026-08-30-proxy-fronted-web-deployment-boundary.zh.md)

## Problem

The Web application needs a usable deployment posture for access through a managed HTTPS reverse proxy, but binding the Harness process to all interfaces would make a tool-capable Host API directly reachable on every network interface. The existing browser trust fence also needs one canonical public authority when a proxy terminates TLS; trusting forwarded headers or allowing an HTTP public origin would make the request-routing and cookie rules ambiguous. The local Drive remains single-user storage, so a network transport option must not be presented as enterprise identity, tenant isolation, or cloud storage.

## Decision

The WebServer accepts only `127.0.0.1` and rejects any other bind host, including `0.0.0.0`. Its default `deploymentMode` is `loopback-only`. The optional `proxy-fronted` mode requires `publicOrigin` to be a canonical absolute HTTPS origin with no credentials, path, query, or fragment. The WebServer continues to terminate no TLS and listens only on loopback in both modes.

The CLI exposes this posture as `dsh web --proxy-origin https://host.example`. The reverse proxy owns TLS termination, network admission, user identity, and authorization. It must forward the configured public `Host` and matching HTTPS `Origin` unchanged; the Harness does not interpret `X-Forwarded-*`. Connection adds the configured public authority to its browser trust set, rejects direct loopback or mismatched authorities in proxy mode, requires a matching `Origin` for unsafe HTTP methods, and sets the browser-session cookie's `Secure` attribute. The existing [browser request trust decision](2026-07-28-api-browser-trust-boundary.md) remains the owner of the general Host, Origin, media-type, and Fetch-Metadata fence, while [browser token authentication](2026-08-24-browser-token-authentication.md) remains the owner of the session credential.

This is a transport and browser-request boundary only. It does not create users, organizations, tenants, roles, audit identity, S3/MinIO/NAS storage, backups, malware scanning, or document-level access filtering. Those capabilities require a separate deployment and product decision.

## Alternatives considered

**Bind the Harness process to `0.0.0.0`.** Rejected: a proxy would not remove the direct network path, and a mistake in proxy configuration would expose the tool-capable Host API on every interface.

**Trust `X-Forwarded-Host` and `X-Forwarded-Proto`.** Rejected: those headers are only trustworthy after a complete proxy allowlist and hop-stripping contract exists. Requiring the proxy to preserve the configured public `Host` and HTTPS `Origin` gives the current carrier one explicit authority without inventing a forwarding-header protocol.

**Allow an HTTP `publicOrigin` or omit `Secure` in proxy mode.** Rejected: the network posture is explicitly HTTPS-fronted, and a downgrade would make the browser credential transportable over plaintext.

**Implement enterprise authentication and tenancy in the Harness process.** Rejected for this slice: it would claim identity and authorization semantics that the local Drive and current deployment inputs cannot enforce. The independent proxy remains the owner of those policies.

## Verification

WebServer tests reject non-loopback hosts, missing proxy origins, HTTP origins, and malformed origins. Connection tests cover Secure cookies, public-authority trust, direct-loopback rejection, missing and mismatched Origin rejection for unsafe methods, and successful matching proxy requests. Web Bundle tests cover `--proxy-origin`, non-loopback CLI rejection, proxy URL display, and the assembled WebServer configuration. The focused Host, Connection, and Web Bundle suites and their TypeScript project references pass; the generated configuration catalog records the new configuration contract.

## Consequences

The supported network path is a TLS reverse proxy to a loopback-only Harness process. A proxy misconfigured to rewrite the public authority, omit unsafe-method Origin, or expose the upstream directly receives a refusal rather than silently widening access. The browser session still grants the complete tool-capable Host API after the proxy's network and identity policy has admitted the request; this boundary does not add per-user or per-tenant authorization inside the Harness.

`loopback-only` remains compatible with local HTTP and non-Secure cookies. `proxy-fronted` makes the HTTPS origin and `Secure` cookie requirement explicit, but operators must still supply a real proxy, certificates, identity policy, and operational controls. The local Drive's persistence and authority are unchanged and must not be described as an enterprise cloud drive.
