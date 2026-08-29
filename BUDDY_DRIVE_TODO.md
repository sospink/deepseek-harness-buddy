# DeepSeek Harness Buddy：定位安全 Agent 与资料云盘开发 TODO

> 基线日期：2026-08-29
> 当前上游提交：`cd5ef8148158c3a752a658978873241fdf8e2bbc`（`dsh-v0.1.2-alpha.1`）
> 开发分支：`feature/buddy-drive-core`
> 架构提案：`.agents/notes/proposed/feature/2026-08-29-safety-agent-drive-library.zh.md`

## 状态定义

| 状态 | 含义 |
|---|---|
| 未开始 | 尚无代码或只有调研结论 |
| 进行中 | 已有真实实现，但本阶段验收证据不完整 |
| 已实现 | 代码与聚焦测试完成，但尚未完成阶段级运行验收 |
| 已验收 | 用户路径、持久化、权限、安全和测试证据均满足本表要求 |
| 外部依赖 | 必须等待协议原文、身份系统、对象存储或其他外部条件 |

## 需求验收台账

| ID | 原始需求 | 实现模块 | 用户入口 | 后端/持久化 | 验收证据 | 状态 |
|---|---|---|---|---|---|---|
| R1 | 将三角协作改为单独云盘模式 | Buddy Drive Bundle、独立 Overlay | 侧栏“资料云盘” | `ctx.drive` | Drive 模式无成员表、任务板、邮箱和通信入口 | 进行中 |
| R2 | 定位安全 Agent | Agent Preset、只读 Drive Tools | 新建定位安全 Agent 会话 | Session Log、Tool Pipeline | Agent 只读取显式选择或工具请求的文件版本，并返回来源 | 未开始 |
| R3 | 上传角色分工文档 | Drive Core、Upload API、Drive UI | 云盘上传与分类 | Blob Store、`buddy_drive` Domain | 上传后重启仍存在，可标记为“角色分工” | 进行中 |
| R4 | 支持 Markdown | Admission、Markdown Preview | 文件预览面板 | 原文件 Blob | `.md/.markdown` 签名与 UTF-8 校验、源码/渲染预览 | 进行中 |
| R5 | 支持 PDF | Admission、PDF.js Preview | 文件预览面板 | Range Content Route | PDF 签名校验、分页/缩放/Range 读取 | 进行中 |
| R6 | 支持 DOCX | Admission、DOCX Preview | 文件预览面板 | OOXML Blob、Preview Worker | OOXML 结构/ZIP Bomb 校验、隔离在线预览 | 进行中 |
| R7 | 沟通功能暂不做 | Bundle Composition | 无入口 | 不挂载 Team/Mailbox | Profile 和 UI 中不存在沟通能力 | 未开始 |
| R8 | 探索或开发 WorkBuddy 类资料库插件 | 插件评估、Drive Seam | 不适用 | 不适用 | 评估 `dsh-files`、`dsh-file-explorer`、`dsh-univer-office`、MinerU 并记录取舍 | 已实现 |
| R9 | 后续可持续同步官方 Harness | Fork-owned Packages、窄 Bundle Patch | 不适用 | Git `upstream` | 自有实现限制在 `packages/buddy` 与明确集成点，上游包不被散改 | 进行中 |

## 阶段 0：分析、设计和开发基线

- [x] 阅读 Harness 的 Profile、Bundle、Cordis、Typert Remote、Storage Domain、Workspace、Attachment、Deliverables、Client Slots 和 Agent Team 源码。
- [x] 评估社区文件/Office 插件的源码、许可证和版本兼容性。
- [x] 输出中英文 Drive 架构 Agent Note。
- [x] 创建并推送 `develop` 分支。
- [x] 创建 `feature/buddy-drive-core` 功能分支。
- [x] 建立需求验收台账和阶段 TODO。
- [ ] 获取“低空安全协议”和原“三角协作”角色定义原文；在拿到前不得声称领域协议合规。**状态：外部依赖。**
- [ ] 确认正式中文产品名、Logo 和分类字典；暂用“定位安全 Agent”“资料云盘”。

### 阶段 0 退出条件

- [x] 每项原始需求都映射到模块、入口、数据边界和验收证据。
- [x] 明确第一期仅回环本地模式，不声称已具备企业云盘的身份、分享和租户隔离。
- [x] 明确 Agent Team 不属于目标组合，Drive 不依赖 Workspace Path 或聊天 Attachment。

## 阶段 1：Drive Core 与本地 Provider

### Service Definition

- [x] 新建 `@sospink/dsh-buddy-drive`。
- [x] 定义 Library、Folder、File、Version、Audit 的品牌化 ID 和不可变快照。
- [x] 定义 `ctx.drive` 的 Provider 无关接口。
- [x] 定义错误码、上传限制、分类、媒体类型和预览状态。
- [x] 定义读取、创建文件夹、导入文件、重命名、移动、软删除、恢复和版本列表操作。

### Local Provider

- [x] 新建 `@sospink/dsh-buddy-drive-local`。
- [x] 使用 `buddy_drive` Storage Domain 保存元数据。
- [x] 在 `$DSH_HOME/buddy-drive/blobs/sha256` 保存内容寻址 Blob。
- [x] 实现临时写入、摘要校验、文件 `fsync`、原子发布和目录 `fsync`。
- [x] 实现 Markdown/PDF/DOCX 主机侧准入校验。
- [x] 实现名称规范化、单文件配额、资料库配额和并发操作串行化。
- [x] 实现软删除、恢复和无引用 Blob 垃圾回收接口。
- [x] 实现启动一致性检查：元数据引用的 Blob 必须存在且摘要一致。
- [x] 实现中断上传残留临时文件清理。
- [x] 每个修改生成不可变审计记录。

### 阶段 1 测试

- [x] ID、Schema、名称、媒体类型和分类单元测试。
- [x] Markdown/PDF/DOCX 合法样本准入测试。
- [x] 扩展名欺骗、双扩展名、NUL、未知 ZIP、宏格式和非法 UTF-8 拒绝测试。
- [x] DOCX ZIP 条目数、解压大小和压缩比限制测试。
- [x] 路径穿越、符号链接和预置目标攻击测试。
- [x] 重复 Blob、重复名称、并发导入和配额测试。
- [x] Storage 写失败、Blob 写失败、元数据提交失败和重启恢复测试。
- [x] HMR/插件卸载后 Service 和 Domain 释放测试。

### 阶段 1 退出条件

- [x] 通过真实 Cordis 组合完成“创建文件夹 → 上传 Markdown → 列表 → 读取 → 删除 → 恢复 → 重启仍存在”。
- [x] 原始文件不能通过 Workspace、Shell 或用户路径参数绕过 Drive API 访问。
- [x] 聚焦测试、TypeScript、Lint、Package Constraints、Invariant 和文档 Gate 全部通过。

## 阶段 1 验收证据（2026-08-29）

- Buddy 源码严格覆盖率：Statements `555/555`、Branches `346/346`、Functions `129/129`、Lines `496/496`，全部 `100%`。
- 聚焦测试：9 个 Test Files、69 个 Tests 全部通过，包含真实 `cordis.yml` Loader 组合。
- 全仓库 Host TypeScript 与 tsdown Build：`pnpm run build:lib:host` 通过。
- 全仓库 Client TypeScript 与 tsdown Build：`pnpm run build:lib:client` 通过。
- Built Import Smoke：`DriveStore`、`LocalDriveStore` 和两个 Invariant Companion 可由 plain Node 导入。
- Built Invariant Gate：249 个编译后 Package Companion 全部通过 plain-Node Loader 检查。
- 两个 Buddy Package 的 `publint`：All good，无打包警告。
- 定向 OXLint、Workspace Constraints、Project Reference Faces、Package Invariants、Package README Model Experience、Known Limitations、Package Paths、Translation Pairing 和 Markdown Links 全部通过。
- 安全证据覆盖：运行时枚举绕过、扩展名/MIME 欺骗、二进制伪装、DOCX 宏/AltChunk/外部关系/ZIP Bomb、路径与符号链接、权限、磁盘 IO 故障、并发发布、元数据写失败、孤儿回收、Blob 缺失/损坏、重启和完整状态关系损坏。

## 阶段 2：API、独立 UI 和上传体验

- [x] 新建 `@sospink/dsh-buddy-api-drive`，元数据命令使用 Typert Remote。
- [x] 上传使用同源 HTTP 流，不在 JSON 中 Base64 编码。
- [x] 内容路由只接受不透明 Version ID，并支持 `GET`、`HEAD` 和 Range。
- [x] 路由执行 Host/Origin、方法、大小、取消和响应头检查。
### 阶段 2A Host/API 证据（2026-08-29）

- `@sospink/dsh-buddy-api-drive` 已实现 Typert Remote 的完整元数据命令和可重连 Snapshot Feed。
- 上传路由为认证 `POST /api/buddy-drive/upload` 原始二进制 Body；新文件与追加版本参数互斥，不接受文件系统路径或 Base64 JSON。
- 内容路由为认证 `GET|HEAD /api/buddy-drive/content/<versionId>`，支持完整读取、开放/闭合/后缀单 Range、`416` 完整大小标记和防御性响应头。
- Host/API 源码严格覆盖率：Statements `255/255`、Branches `139/139`、Functions `70/70`、Lines `218/218`，全部 `100%`；6 个 Test Files、36 个 Tests 全部通过。

- [ ] 新建 `@sospink/dsh-buddy-client-ui-drive`。
- [ ] 在 `sidebar.footer.action` 注册“资料云盘”。
- [ ] 在 `shell.overlay` 注册独立云盘页面。
- [ ] 实现文件夹树、文件表格、分类、上传队列、进度、取消、重试、下载、删除和恢复。
- [ ] 实现重连后的状态恢复和错误态。
- [ ] 完成键盘导航、焦点恢复、窄窗口和中英文文案。

### 阶段 2 退出条件

- [ ] 用户无需进入对话即可完成资料管理。
- [ ] 浏览器刷新和 Host 重启后，列表、文件夹、分类和版本一致。
- [ ] 上传中断不会产生可见的半成品文件。
- [ ] 浏览器 UI Snapshot 和真实 Loader 组合测试通过。

## 阶段 3：Markdown、PDF、DOCX 在线预览

- [ ] Markdown 使用 Harness `MarkdownText`，提供源码/预览切换并默认禁止远程图片。
- [ ] PDF.js 支持分页、缩放、搜索、虚拟化和 Range Read。
- [ ] 禁止 PDF 内嵌 JavaScript，外链必须显式点击。
- [ ] DOCX 使用隔离 iframe/Document 和 `docx-preview`，关闭 AltChunk 和外部资源。
- [ ] DOCX 解析运行于 Worker，具备超时和资源限制。
- [ ] Mammoth 仅用于受限文本提取，输出必须清洗，不作为主视觉预览。
- [ ] 预览失败不能影响原始 Blob 下载和其他文件预览。

### 阶段 3 退出条件

- [ ] 中英文 Markdown、PDF、DOCX 代表样本在 Chrome 与 Safari 在线预览。
- [ ] 恶意 HTML、Markdown、PDF 和 DOCX 外部关系测试不会执行脚本或静默访问外网。
- [ ] 长文档的内存、首屏时间和滚动行为满足已记录预算。

## 阶段 4：定位安全 Agent 与只读资料能力

- [ ] 新建定位安全 Agent Preset。
- [ ] 实现 `drive_list`、`drive_search`、`drive_read`。
- [ ] Tool Result 带 File ID、Version ID、名称、分类和来源标记。
- [ ] 对输出字节、条目数和文本窗口做完整预算。
- [ ] 系统提示明确资料内容是不可信证据，不是系统指令。
- [ ] 不自动把资料库内容注入 Prompt。
- [ ] 第一版不提供 Agent 删除、覆盖、移动和发布工具。
- [ ] Buddy Bundle 不挂载 Agent Team、Team UI 和 Team Tool。

### 阶段 4 退出条件

- [ ] Agent 能基于用户选定的角色分工文档回答并引用准确版本。
- [ ] Agent 无法通过 Drive Tool 修改资料，也无法通过 Workspace Path 绕过。
- [ ] Session 回放可以重建每次模型看到的资料内容与来源。

## 阶段 5：部署加固与可选知识检索

- [ ] 认证反向代理、TLS、用户身份、CSRF 和租户隔离。
- [ ] S3/MinIO/NAS Provider。
- [ ] 备份、恢复、留存策略、指标和告警。
- [ ] 杀毒/CDR Provider 接口。
- [ ] 全文索引继承 File/Version 删除和权限语义。
- [ ] 文档级权限过滤验证完成后才启动向量 Embedding/RAG。

## 当前开发批次

本批次只认定以下交付范围，未完成项不得提前标记为阶段完成：

1. Drive Service Definition 和类型模型。
2. 本地 Blob 与元数据 Provider。
3. Markdown、PDF、DOCX 基础准入校验。
4. 文件夹、上传、列表、读取、软删除、恢复和版本历史。
5. 上述能力的聚焦测试与真实 Cordis 组合测试。

## 决策与遗留风险

- **协议原文缺失**：当前“低空安全”只转化为控制面/数据面分离、最小权限、审计和默认拒绝，不能宣称满足某一正式行业协议。
- **Harness 版本风险**：当前为开发者预览 `0.1.2-alpha.1`，后续同步上游必须通过 Adapter 与集成测试，不直接追随每日主干。
- **云服务命名风险**：阶段 1–4 是本地回环资料盘；未完成阶段 5 前，不具备真正多用户企业云盘能力。
- **DOCX 保真风险**：浏览器预览与 Word 可能存在差异；LibreOffice 转 PDF 仅作为后续可选沙箱 Provider。
- **第三方许可证风险**：MinerU 为 AGPL-3.0；`dsh-file-explorer` 检查时仓库未跟踪 LICENSE；任何源码复用必须再次审查并记录 Notices。
