# Agent Note: proxy-fronted Web deployment boundary

Status: implemented

[English](2026-08-30-proxy-fronted-web-deployment-boundary.md) | 中文

## Problem

Web 应用需要一种可以通过受管理的 HTTPS 反向代理访问的部署姿态，但让 Harness 进程绑定所有网卡，会使具备工具能力的 Host API 直接暴露在每个网络接口上。已有的浏览器信任围栏在代理终止 TLS 时也需要一个规范的公网 authority；信任转发头或允许 HTTP 公网 origin 会让请求路由和 cookie 规则变得含糊。本地 Drive 仍是单用户存储，因此网络传输选项不能被表述为企业身份、租户隔离或云存储能力。

## Decision

WebServer 只接受 `127.0.0.1`，拒绝包括 `0.0.0.0` 在内的其他绑定主机。其 `deploymentMode` 默认为 `loopback-only`。可选的 `proxy-fronted` 模式要求 `publicOrigin` 是规范的绝对 HTTPS origin，不能包含凭据、路径、查询或片段。两种模式下 WebServer 都不终止 TLS，并且只监听回环地址。

CLI 通过 `dsh web --proxy-origin https://host.example` 暴露这一姿态。反向代理负责 TLS 终止、网络准入、用户身份和授权。代理必须原样转发配置的公网 `Host` 与匹配的 HTTPS `Origin`；Harness 不解释 `X-Forwarded-*`。Connection 会把配置的公网 authority 加入浏览器信任集合，在代理模式拒绝直连回环地址或不匹配的 authority，对不安全 HTTP 方法要求匹配的 `Origin`，并为浏览器会话 cookie 设置 `Secure` 属性。已有的[浏览器请求信任决策](2026-07-28-api-browser-trust-boundary.zh.md)仍负责一般的 Host、Origin、媒体类型和 Fetch-Metadata 围栏，[浏览器令牌认证](2026-08-24-browser-token-authentication.zh.md)仍负责会话凭据。

这只是传输和浏览器请求边界，不会创建用户、组织、租户、角色、审计身份、S3/MinIO/NAS 存储、备份、杀毒或文档级访问过滤。这些能力需要独立的部署与产品决策。

## Alternatives considered

**让 Harness 进程绑定 `0.0.0.0`。** 否决：这样代理不会移除直连网络路径，代理配置错误时也会把具备工具能力的 Host API 暴露到所有接口。

**信任 `X-Forwarded-Host` 和 `X-Forwarded-Proto`。** 否决：只有在完整的代理 allowlist 与逐跳移除契约存在时，这些头才可被信任。要求代理保留配置的公网 `Host` 与 HTTPS `Origin`，可以在不发明转发头协议的情况下，为当前载体提供一个明确 authority。

**允许 HTTP `publicOrigin` 或在代理模式省略 `Secure`。** 否决：该网络姿态明确要求 HTTPS 前置，降级会使浏览器凭据可以通过明文传输。

**在 Harness 进程中实现企业认证和多租户。** 本切片不采用：这会声称本地 Drive 和当前部署输入无法执行的身份与授权语义。独立代理仍负责这些策略。

## Verification

WebServer 测试拒绝非回环主机、缺失代理 origin、HTTP origin 和格式错误的 origin。Connection 测试覆盖 Secure cookie、公网 authority 信任、直连回环拒绝、不安全方法缺失或不匹配 Origin 的拒绝，以及正确代理请求的通过。Web Bundle 测试覆盖 `--proxy-origin`、CLI 非回环拒绝、代理 URL 展示和组装后的 WebServer 配置。Host、Connection、Web Bundle 聚焦测试及其 TypeScript 工程引用均通过；生成的配置目录记录了新的配置契约。

## Consequences

受支持的网络路径是 TLS 反向代理到仅回环监听的 Harness 进程。代理如果错误改写公网 authority、遗漏不安全方法的 Origin，或直接暴露上游，Harness 会拒绝请求，而不是静默扩大访问范围。代理的网络和身份策略放行后，浏览器会话仍授予完整的工具能力 Host API；本边界不会在 Harness 内增加按用户或租户的授权。

`loopback-only` 继续兼容本地 HTTP 和不带 Secure 的 cookie。`proxy-fronted` 明确要求 HTTPS origin 和 `Secure` cookie，但运维方仍需提供真实代理、证书、身份策略及运维控制。本地 Drive 的持久化和 authority 不变，不得将其描述为企业云盘。
