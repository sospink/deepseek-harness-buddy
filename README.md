# Low-Altitude Safety Collaboration Agent

English | [中文](README.zh.md)

A development collaboration platform for low-altitude safety teams, customized on top of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) and Cordis. This repository contains the application-specific interface, professional agent roles, resource library, prototype canvas, and development management; it is not the upstream DeepSeek product.

Application code is maintained on [`dev`](https://github.com/sospink/deepseek-harness-buddy/tree/dev). Select that branch when browsing or cloning this repository.

## Features

- **Agent conversations:** professional roles, a dark glass-style composer, a collapsible floating sidebar, and a welcome page.
- **Resource library:** upload and organize files, preview materials, and browse task attachments as a directory tree.
- **Prototype canvas:** preview HTML designs and edit elements, text, styles, and positions.
- **Development management:** create, review and assign requirements, receive tasks, upload deliverables, and track history.
- **Acceptance review:** engineers submit results with a summary; product managers approve them or return them with a required reason. Acceptance records persist across refreshes and restarts.
- **Delivery checks:** inspect a configured local Git repository after acceptance, with human confirmation before merge-request submission. See [development management](packages/buddy/development-management/README.md) for requirements and limitations.

## Run from source

Use Node.js `22.19.x` or a later `22.x` release, or Node.js `24+`, and pnpm `11.7.0`. Git is required for a repository checkout. Read the [safety notice](SAFETY.md) before running agent tools.

```sh
git clone --branch dev https://github.com/sospink/deepseek-harness-buddy.git
cd deepseek-harness-buddy
corepack pnpm install --frozen-lockfile
corepack pnpm run build
corepack pnpm start:buddy -- --no-open
```

After the service reports that it is ready, open [http://127.0.0.1:3080/](http://127.0.0.1:3080/). Keep the terminal running; press `Ctrl+C` to stop. If port `3080` is occupied, stop the existing instance first.

Use `start:buddy` for this application. `pnpm dsh web` and the upstream npm package start the default Harness interface without the Buddy composition. Daily startup needs only the last command; install and build again after updating source or dependencies.

Configure a model provider and API key in Settings before using model conversations or generation. No development API key is included in the repository or customer archive.

## Submit and review results

Open **Development Management** from the sidebar. Conversation roles and development-management roles serve different purposes; use the role selector inside Development Management for these steps.

1. As **Product Manager**, create a requirement with acceptance criteria, submit it for review, and assign it.
2. Switch to the matching engineering role, open the task, and choose **Receive and Develop**.
3. Upload deliverables, choose **Submit for Acceptance**, and enter a results summary.
4. As **Product Manager**, choose **Review Results**. Approve the task or enter a reason and return it for changes.
5. After approval, the engineer can request a delivery check. Returned tasks allow additional uploads and another acceptance submission.

Local role switching demonstrates the workflow; it does not establish enterprise account isolation or a deployed multi-user authorization system. Remote GitLab actions require repository and credential configuration; automated GitHub PR creation is not implemented. Consult the [delivery checklist](docs/buddy-development-management-ledger.md) before customer acceptance.

## Windows deployment and data

Windows customers should use the Windows source ZIP and extract it to a short path such as `C:\buddy`. Install dependencies and build before daily startup. The ZIP includes the generated `Start-LowAltitudeSafetyAgent.cmd` and `DELIVERY-GUIDE.zh-CN.md`; it is not a preinstalled runtime. See the [local startup guide](本地启动说明.md). This README does not claim native Windows verification for every feature.

The Buddy launcher stores configuration, sessions, credentials, library data, and task data under `.harness-buddy-home/`. Back up that directory before migration; do not commit it or include it in source deliveries. API keys and uploaded customer materials are sensitive data.

The `package:buddy` script creates source archives under `dist-delivery/`, excluding local runtime data, dependencies, build caches, and recording output. See the [packaging script](scripts/package-buddy.mjs) for archive contents and host-tool requirements.

## Development and documentation

This is an actively developed customized application, not a claim that all repository checks or customer acceptance criteria pass. Consult actual check results before deploying a revision.

- [Buddy application overview](packages/buddy/README.md)
- [Development management and acceptance](packages/buddy/development-management/README.md)
- [Development guide](docs/development.md) and [architecture](docs/architecture.md)
- [Contribution guidelines](CONTRIBUTING.md) and [agent instructions](AGENTS.md)
- [Report an issue](https://github.com/sospink/deepseek-harness-buddy/issues)

## License and attribution

This application extends DeepSeek Harness, the open-source agent harness developed by DeepSeek AI, and its Cordis plugin architecture. Custom application changes are maintained separately from upstream.

[MIT License](LICENSE). Third-party dependency licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
