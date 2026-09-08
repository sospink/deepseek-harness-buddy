# 低空安全协作开发 Agent 平台

[English](README.md) | 中文

面向低空安全团队，基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 和 Cordis 定制开发的协作平台。本仓库包含平台专属界面、专业 agent（智能体）身份、资料库、原型画布与开发管理，不代表 DeepSeek 上游官方产品。

平台应用代码维护在 [`dev`](https://github.com/sospink/deepseek-harness-buddy/tree/dev) 分支。浏览或克隆本仓库时，请选择该分支。

## 主要功能

- **Agent 对话：** 专业身份、深色玻璃质感输入框、可收缩悬浮侧边栏与欢迎页。
- **资料库：** 上传和组织文件、预览资料，以目录树浏览任务附件。
- **原型画布：** 预览 HTML 设计稿，编辑元素、文字、样式和位置。
- **开发管理：** 创建、评审和指派需求、接收任务、上传成果及追踪历史。
- **成果验收：** 工程师填写成果说明并提交，产品经理验收通过或填写必填原因后退回；验收记录在刷新和重启后保留。
- **交付检查：** 验收后检查已配置的本地 Git 仓库，并在提交合并请求前保留人工确认。要求和限制见[开发管理说明](packages/buddy/development-management/README.zh.md)。

## 从源码启动

使用 Node.js `22.19.x` 或更新的 `22.x` 版本，或 Node.js `24+`，以及 pnpm `11.7.0`。从仓库部署需要安装 Git。运行 agent 工具前，请阅读[安全说明](SAFETY.zh.md)。

```sh
git clone --branch dev https://github.com/sospink/deepseek-harness-buddy.git
cd deepseek-harness-buddy
corepack pnpm install --frozen-lockfile
corepack pnpm run build
corepack pnpm start:buddy -- --no-open
```

终端提示服务就绪后，打开 [http://127.0.0.1:3080/](http://127.0.0.1:3080/)。使用期间保持终端运行，按 `Ctrl+C` 停止。如果 `3080` 端口被占用，请先停止已有实例。

本平台请使用 `start:buddy`。`pnpm dsh web` 和上游 npm 包启动的是默认 Harness 界面，不会加载 Buddy 组合。日常启动只需最后一条命令；更新源码或依赖后，需要重新安装和构建。

使用模型对话或生成功能前，请在“设置”中配置模型服务和 API Key。仓库与客户交付包均不包含开发机的 API Key。

## 提交验收与审核成果

从侧边栏进入**开发管理**。对话身份与开发管理角色用途不同；以下操作使用开发管理内的角色选择器。

1. 以**产品经理**角色创建需求并填写验收标准，提交评审后指派任务。
2. 切换到任务匹配的工程师角色，打开任务，点击**接收并开发**。
3. 上传成果，点击**提交验收**，填写成果说明。
4. 产品经理点击**审核成果**，选择验收通过，或填写原因后退回修改。
5. 验收通过后，工程师可以申请交付检查；退回的任务允许继续上传成果并再次提交验收。

本地角色切换用于演示工作流程，不等同于企业账号隔离或已部署的多人授权体系。远程 GitLab 操作需要配置仓库和凭据；尚未实现自动创建 GitHub PR（Pull Request）。客户验收前请核对[交付检查清单](docs/buddy-development-management-ledger.zh.md)。

## Windows 部署与数据

Windows 客户请使用 Windows 源码 ZIP，解压到 `C:\buddy` 等短路径。完成依赖安装和构建后再日常启动。ZIP 内含打包生成的 `Start-LowAltitudeSafetyAgent.cmd` 和 `DELIVERY-GUIDE.zh-CN.md`，并非预装运行环境。详见[本地启动说明](本地启动说明.md)。本 README 不代表所有功能均已完成 Windows 原生验证。

Buddy 启动器将配置、会话、凭据、资料库和任务数据保存在 `.harness-buddy-home/`。迁移前请备份该目录，不要将它提交到仓库或放入源码交付包。API Key 和上传的客户资料属于敏感数据。

`package:buddy` 脚本在 `dist-delivery/` 下生成源码交付包，排除本地运行数据、依赖、构建缓存和录屏产物。打包内容及宿主工具要求见[打包脚本](scripts/package-buddy.mjs)。

## 开发与文档

本项目是持续开发中的定制应用，不表示仓库全部检查或客户验收标准均已通过。部署某个版本前，请核对实际检查结果。

- [Buddy 平台概览](packages/buddy/README.zh.md)
- [开发管理与成果验收](packages/buddy/development-management/README.zh.md)
- [开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)
- [贡献指南](CONTRIBUTING.zh.md)与[Agent 开发约束](AGENTS.md)
- [提交问题反馈](https://github.com/sospink/deepseek-harness-buddy/issues)

## 许可证与上游说明

本平台基于 DeepSeek AI 开发的开源 agent harness（智能体框架）DeepSeek Harness 及其 Cordis 插件架构扩展。定制应用改动与上游分开维护。

[MIT 许可证](LICENSE)。第三方依赖许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
