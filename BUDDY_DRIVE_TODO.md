# DeepSeek Harness Buddy：定位安全 Agent 与资料云盘开发 TODO

> 基线日期：2026-08-29
> 当前上游提交：`cd5ef8148158c3a752a658978873241fdf8e2bbc`（`dsh-v0.1.2-alpha.1`）
> 开发分支：`feature/buddy-upload-queue`
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
| R1 | 将三角协作改为单独云盘模式 | Buddy Drive Bundle、独立 Overlay | 侧栏“资料云盘” | `ctx.drive` | 真实 Bundle 与浏览器入口已验收，未挂载成员表、任务板、邮箱或通信入口 | 已验收 |
| R2 | 定位安全 Agent | Agent Preset、只读 Drive Tools | 新建定位安全 Agent 会话 | Session Log、Tool Pipeline | 真实 Profile 可创建 `positioning-safety` Session；Mock Agent 显式读取版本并引用 File/Version/Digest，首次请求无正文，`tool/result` 可精确回放 | 已验收 |
| R3 | 上传角色分工文档 | Drive Core、Upload API、Drive UI | 云盘上传与分类 | Blob Store、`buddy_drive` Domain | Markdown 角色分工样本已从浏览器上传，Host 重启后文件夹、文件和分类仍存在 | 已验收 |
| R4 | 支持 Markdown | Admission、Markdown Preview | 文件预览面板 | 原文件 Blob | Chrome 已验证真实源码/渲染预览、原始 HTML 字面化且远程图片不发起请求；Safari 尚待验收 | 已实现 |
| R5 | 支持 PDF | Admission、PDF.js Preview | 文件预览面板 | Range Content Route | Chrome 已验证中文双页 Canvas、搜索跳页、缩放、同源 Worker/CMap、3 个 `206` Range、脚本阻止和外链白名单；Safari 尚待验收 | 已实现 |
| R6 | 支持 DOCX | Admission、DOCX Preview | 文件预览面板 | OOXML Blob、Preview Worker | Chrome 已验证 Worker OOXML 预检、opaque iframe、中文双页/表格/图片、自动适配宽度、父页面不可读正文且无外网请求；Safari 尚待验收 | 已实现 |
| R7 | 沟通功能暂不做 | Bundle Composition | 无入口 | 不挂载 Team/Mailbox | Buddy Drive Bundle 仅组合 Drive Local、Drive API 与 Drive UI，浏览器无沟通入口 | 已验收 |
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

- [x] 新建 `@sospink/dsh-buddy-client-ui-drive`。
- [x] 在 `sidebar.footer.action` 注册“资料云盘”。
- [x] 在 `shell.overlay` 注册独立云盘页面。
- [x] 实现文件夹导航、当前目录文件列表与搜索、分类、原始文件上传、下载、软删除和恢复。
- [x] 增加多文件上传队列、可视进度、用户取消和失败重试。

### 阶段 2C 上传队列设计与验收契约（2026-08-30）

- 队列由 Browser Consumer 所有，不扩张 Drive Service Definition 或 Host 上传协议；Host 继续以单文件原始二进制请求作为原子提交边界。
- 队列最多保留 100 项、最多并发 2 项；超限必须在任何请求发出前整体拒绝本次新增选择。
- 每项投影 `queued/uploading/succeeded/failed/cancelled`、文件名、总字节、已发送字节、错误和已提交 File ID；React Snapshot 不保留 XHR、AbortController 或其他可变句柄。
- XHR 仅用于同源上传进度与取消；成功仍只认 Host `201` 和合法 `{ kind: "file", file }`。排队/上传中可取消，失败/取消可重试。
- Host 已提交成功后，即使随后 Baseline Refresh 失败，该项仍保持 `succeeded`，只报告资料库刷新错误，不把它变为可重试上传，避免生成重复文件。
- 清理操作只移除 `succeeded/cancelled`；`failed` 项保留到用户重试。选择新文件时不阻塞已有上传，直到达到队列上限。

### 阶段 2C 上传队列实现与验收证据（2026-08-30）

- 新增 `src/client/upload.ts` 同源 XHR Transport 和 `src/client/UploadQueue.tsx` 队列 UI；Client Service 负责稳定 Upload ID、最多 2 项并发、逐项进度、取消、重试、清理和最终刷新。
- 聚焦 Client/API/Local 测试覆盖队列状态机、XHR 成功/失败/超时/取消、队列上限、并发、失败隔离、Refresh 失败、Upload ID 重放和冲突；27 个 Test Files、193 个 Tests 全部通过，Statements `1744/1744`、Branches `1079/1079`、Functions `458/458`、Lines `1470/1470`，全部 `100%`。
- 真实 Chromium Web Profile 已同时选择至少 3 个文件：初始观察到 2 项 `uploading`、后续项 `queued`；queued 和 uploading 均可取消；取消后重试成功；首次请求已由 Host 提交但浏览器收到 abort 时，重试使用相同 Upload ID 并只保留一个发布文件。
- 同一 Profile 的持久化 `buddy_drive.json` 已核对：完成项和取消后重试项各只有一个 `file/import` 文件与一条带 `idempotencyKey`/`requestDigest` 的审计记录；被取消的排队项没有发布文件；一项无效 PDF 失败后，后续两个有效 Markdown 仍成功。

### 阶段 2C 退出条件

- [x] 真实浏览器同时选择至少 3 个文件时，观察到并发不超过 2、逐项进度和最终成功状态。
- [x] 用户可取消 queued 与 uploading 项；已取消项不会发布文件，重试后只发布一次。
- [x] 一项失败不阻塞后续项；失败项可重试，成功项不会因 Refresh 失败被误标为可重试。
- [x] 队列状态机、XHR Protocol、UI 操作和边界分支具备严格 100% 源码覆盖率。
- [x] 实现 Snapshot Feed 重连、状态替换、失败回滚和手动刷新错误态。
- [x] 完成原生文件输入、关闭后焦点恢复和中英文文案。
- [x] 完成 Modal 初始焦点、正向/反向 Tab 边界和 390 px 窄窗口真实浏览器验收。
- [x] 新建 `@sospink/dsh-buddy-drive-app`，以可安装 Bundle 组合 Local、API 与 Client UI。

### 阶段 2C 退出结论

Phase 2C 的实现、聚焦测试、严格覆盖率、真实 Chromium 浏览器和持久化幂等证据均已完成。原生 Safari 26.3.1、正式品牌/协议输入、企业云盘部署能力和 Phase 5 仍按下文保持未完成；本结论不把 Playwright WebKit 结果冒充原生 Safari。

### 阶段 2B Client UI/Bundle 证据（2026-08-29）

- `@sospink/dsh-buddy-client-ui-drive` 通过 `ctx.remote.$mount(driveRemote)` 动态挂载 Drive Remote，并在挂载后通过 `ctx.get('remote.drive')` 获取动态服务，真实浏览器未再出现静态 Inject 守卫错误。
- Client UI 源码严格覆盖率：Statements `662/662`、Branches `429/429`、Functions `194/194`、Lines `533/533`，全部 `100%`；12 个 Test Files、79 个 Tests 全部通过。
- `@sospink/dsh-buddy-drive-app` 的 Bundle Manifest、Patch 行顺序、配置、依赖映射、Host Marker 与 Invariant 共 3 个 Tests 全部通过。
- Host 与 Client TypeScript Project References、完整 `pnpm run build`、Client Bundle Purity、Workspace Constraints、Package Invariants、README Model Experience/Known Limitations、Package Paths 与 Markdown Links 门禁全部通过。
- 隔离 Profile 的真实浏览器路径已验证：打开独立资料云盘、创建“角色资料”文件夹、上传 UTF-8 Markdown、搜索、修改分类、完整下载、单 Range `206`、软删除、显示已删除、恢复；浏览器控制台无 Buddy 插件加载错误。
- Host 重启后，“角色资料”文件夹、Markdown 文件和更新后的“安全协议”分类仍存在，证明元数据与 Blob 持久化链路成立。
- Phase 2 当时只交付资料管理；Phase 3 随后以独立变更加入 Markdown/PDF/DOCX 预览，避免把后续能力倒算为 Phase 2 完成证据。

### 阶段 2 退出条件

- [x] 用户无需进入对话即可完成第一版资料管理。
- [x] 浏览器刷新和 Host 重启后，列表、文件夹、分类和当前版本一致。
- [x] 上传失败或中断不会发布可见的半成品文件；原子提交和失败回滚已有聚焦测试。
- [x] Client DOM 交互测试、真实浏览器截图和真实 Loader/Bundle 组合测试通过。

## 阶段 3：Markdown、PDF、DOCX 在线预览

### 阶段 3A Markdown 预览实现（2026-08-29）

- 不可变 Content Route 读取具备 2 MiB 完整结果预算、UTF-8 Fatal Decode、超限取消、文件切换取消和失败重试。
- 图片策略在进入 Harness `MarkdownText` 前基于 GFM/Math Parse Tree 转义 Image/ImageReference 起始标记；代码围栏和行内代码中的图片字面量保持不变。
- 渲染模式不产生文档作者控制的 `<img>`；Harness 继续负责原始 HTML 字面化、危险协议拒绝和安全外链属性。
- PDF 与 DOCX 仍显示诚实占位，不因 Markdown 切片完成而提前标记。
- Chrome 真实浏览器恶意样本验证：DOM 中无文档 `<img>`/`<script>`，无 `example.com` 网络请求，页面状态未被脚本修改，控制台 `0 error`；Safari 证据仍待补充。

### 阶段 3B PDF.js 预览实现（2026-08-29）

- PDF.js `6.2.108` Runtime 延迟初始化，但通过 Buddy 包级 `codeSplitting: false` 内联进唯一 Loader-owned `client.js`；构建后无未托管 PDF Chunk。
- Host 提供认证同源、固定版本 Worker exact route，以及只允许包内枚举 `.bcmap` 文件名的 CMap prefix route；不依赖 CDN。
- PDF 内容使用现有不可变 Content Route：`disableStream: true`、Range enabled、64 KiB Chunk、首屏完成后忽略迟到 Progress，真实 662 KiB Fixture 观察到 3 个 `206`。
- Viewer 采用单页驻留 Canvas，支持上一页/下一页、50%–200% 缩放、最多 500 页的可取消文本搜索，并设置 16M Image Pixel 与 64 MiB Canvas Backing Store 预算。
- Canvas 使用 `AnnotationMode.DISABLE`，不挂载 Annotation/Scripting Layer；Document/Page JavaScript Action 只触发“已阻止”提示。Annotation 仅把绝对 HTTP(S) URL 投影为 `_blank` + `noopener noreferrer` 的显式链接。
- Chrome 中文双页恶意 Fixture 已验证：Canvas 两页可读、搜索跳到第 2 页、125% 重绘、危险 `javascript:` 链接不显示、脚本未执行、控制台 `0 warning/0 error`。Safari 证据仍待补充。

- [x] Markdown 使用 Harness `MarkdownText`，提供源码/预览切换并默认禁止远程图片。
- [x] PDF.js 支持分页、缩放、搜索、单页虚拟化和 Range Read。
- [x] 禁止 PDF 内嵌 JavaScript，外链必须显式点击。

### 阶段 3C DOCX 隔离预览实现（2026-08-29）

- `docx-preview@0.4.0` 的 `parseAsync` 依赖 DOMParser，WordDocument 不可 Structured Clone；最终边界为 Worker OOXML 安全预检 + opaque-origin sandbox iframe 内完整视觉解析，而非虚假声明整个排版引擎运行在 Worker。
- Host 提供认证同源固定版本 Preflight Worker 与 iframe Runtime Route；Worker 自包含 JSZip，执行 20 MiB 编码、1,000 Entries、64 MiB Expanded、100:1 Ratio 和 10 秒超时预算，并拒绝路径穿越、宏、AltChunk、ActiveX/Embeddings、DTD/Entity、External Relationship 与嵌入包。
- iframe 只有 `sandbox="allow-scripts"`，没有 `allow-same-origin`；CSP 设置 `connect-src 'none'`、`form-action 'none'`、`object/frame/child-src 'none'`。`docx-preview` 使用 `renderAltChunks:false`、`useBase64URL:true`，渲染后清除主动元素/属性。
- 父页面只接受绑定 Nonce 的 boot/ready/failure 与页数，不接收 Word 正文或 DOM；20 MiB 下载、10 秒 Preflight、15 秒 Render Timeout 均可取消，原文件下载始终独立。
- 固定 Word 纸张通过 iframe 内 ResizeObserver 自动缩放：真实 Fixture 从 816px 缩至约 290px，父 iframe `bodyScrollWidth` 等于 314px 可用宽度，无横向裁切。
- Chrome 中文双页 Fixture 已验证：角色表格、列表、分页和内嵌 PNG 真实渲染；父页面读取 iframe Document/Origin 被浏览器隔离；网络仅出现 Content、Runtime、Worker 三个 Drive 请求；控制台 `0 warning/0 error`。Safari 证据仍待补充。

- [x] DOCX 使用 opaque-origin sandbox iframe 和 `docx-preview`，关闭 AltChunk 和外部资源。
- [x] DOCX OOXML 安全预检运行于 Worker，视觉解析在 opaque iframe 中运行；两侧均具备超时和资源限制。
- [x] Mammoth 仅用于 Phase 4 一次性 Node Worker 的有界 Raw Text 提取，输出做文本规范化，不作为主视觉预览。
- [x] Preview Error Boundary 将意外 Renderer 崩溃限制在预览区域；元数据/原文件下载继续存在，切换其他文件可正常预览。

### 阶段 3D 跨浏览器、故障隔离与长文档证据（2026-08-29）

- 新增 Preview Error Boundary；聚焦组件测试证明 Markdown Renderer 崩溃后文件名、分类和原文件下载仍存在，切换 PDF 后正常预览恢复。
- Markdown 仍保留 2 MiB 完整源码预算，但富文本独立限制为 256 KiB/4,000 行；10,004 行 Fixture 的末尾只在源码模式出现，富文本 DOM 为有界前缀。
- DOCX 分页 Holder 增加 `content-visibility:auto`、layout/paint/style containment 和 816×1056 intrinsic size；ResizeObserver 通过一帧合并调度，消除 WebKit undelivered-notification 错误。
- 真实隔离 Profile 在 Chromium 149 与 Playwright WebKit 26.5 使用同一批中英文 Markdown/PDF/DOCX、恶意样本和长文档：初始焦点、双向 Tab 边界、390 px 无横向溢出、详情/预览/下载可达；无外部请求、Console Problem 或 Page Error。
- 长文档最终测量：Markdown Chromium/WebKit 222/405 ms；100 页 PDF 120/145 ms，搜索第 100 页 32/86 ms且始终一个 Canvas；40 页 DOCX 129/164 ms、40 Section/40 Holder并可滚至末端。数值是本机验收证据，不是跨硬件 SLA。
- 原生 Safari 26.3.1 `safaridriver` 返回 “You must enable Allow remote automation”；未得到原生 Safari Session 前，阶段 3 的 Chrome+Safari 双浏览器退出条件保持未完成。

### 阶段 3 退出条件

- [ ] 中英文 Markdown、PDF、DOCX 代表样本在 Chrome 与 Safari 在线预览。Chromium 与 Playwright WebKit 26.5 已通过；原生 Safari 26.3.1 因未启用“允许远程自动化”而拒绝 `safaridriver` Session，尚不能把 WebKit 结果冒充原生 Safari。
- [x] 恶意 HTML/Markdown/PDF/DOCX 策略与代表样本不会执行脚本或静默访问外网；Chromium/WebKit 真实 Profile 观察到 0 个外部请求、0 console warning/error、0 page error；含 `TargetMode="External"` 的 DOCX 通过真实上传路由返回 `400 INVALID_DOCUMENT`，且未发布文件元数据。
- [x] 长文档满足已记录预算：10,004 行/772 KiB Markdown 富文本限制 256 KiB/4,000 行且源码完整；100 页 PDF 首屏单 Canvas；40 页 DOCX 使用 40 个 `content-visibility:auto` Holder。Chromium/WebKit 首屏分别为 222/405 ms（Markdown）、120/145 ms（PDF）、129/164 ms（DOCX），均可滚至末端。

## 阶段 4：定位安全 Agent 与只读资料能力

### 阶段 4 实现与验收证据（2026-08-29）

- 新增 `@sospink/dsh-buddy-tool-drive`，只注册 `drive_list`、`drive_search`、`drive_read`；工具参数没有 Path，也没有 create/version/rename/move/classify/delete/restore/publish 操作。
- `drive_read` 强制同时提供 File ID 和 Version ID，校验文件未删除、版本存在且属于该文件；模型结果包含名称、File ID、Version ID、Digest、分类、Media Type、Folder Path、Tags 和行窗口。
- Markdown 在 Host 有界 UTF-8 解码；PDF.js/Mammoth 在一次性 Node Worker 中提取，具备 20 MiB Source、512 KiB Text、10 秒 Wall、128 MiB Heap 和取消预算。Mammoth 只使用 `extractRawText`，不启用 HTML 或 External File Access。
- List/Search/Read 同时受 Canonical JSON 与 Rendered UTF-8 预算约束；搜索最多 100 Files/20 Hits，诚实报告 skipped/truncated；Read 默认最多 200 Lines。
- Prompt 与每个 Search/Read Result 都声明文档为不可信证据；没有任何资料自动进入 Prompt。Harness 将精确模型可见来源头和文本窗口持久化为普通 `tool/result`，无需新增 Session Event。
- 定位安全 Preset 使用 Complete Persona、关闭 Runtime Context，先挂三个 Scope-local Drive Tool，再对当前/未来所有继承工具建立 Deny，并以 Guard 默认拒绝任何非 `drive_*` 调用。Preset 不含 Shell、FS、Web、Workspace、Skill、Goal、Subagent、Team、Mailbox 或写工具 Row。
- Buddy Bundle 增加 fork-owned system Preset Root，同时完整保留官方 Shipped Root、用户可写 Root 和默认 `standard`。真实 Web Picker 同时显示标准/PTC/极简/创造/定位安全五种模式。
- 隔离 Profile 真实 Remote 已创建 Workspace 和 `agentPreset: positioning-safety` Session；`session/list` Projection 持久显示 `agentPreset: positioning-safety`，浏览器控制台 `0 error/0 warning`。
- 无密钥 Mock LLM 端到端：首次请求只有 `drive_list/search/read` Schema 且不含角色正文；模型显式 `drive_read` 后，第二次请求、Session `tool/result` 与 `deriveMessages()` 保存完全相同的 File/Version/Digest/文本；最终回答引用准确版本。
- 工具包源码严格覆盖率：Statements `337/337`、Branches `196/196`、Functions `81/81`、Lines `266/266`，全部 `100%`；10 个 Test Files、35 个 Tests 全部通过，另有 Built Worker Test 通过。

- [x] 新建定位安全 Agent Preset。
- [x] 实现 `drive_list`、`drive_search`、`drive_read`。
- [x] Tool Result 带 File ID、Version ID、名称、分类和来源标记。
- [x] 对输出字节、条目数和文本窗口做完整预算。
- [x] 系统提示明确资料内容是不可信证据，不是系统指令。
- [x] 不自动把资料库内容注入 Prompt。
- [x] 第一版不提供 Agent 删除、覆盖、移动和发布工具。
- [x] Buddy Bundle 不挂载 Agent Team、Team UI 和 Team Tool。

### 阶段 4 退出条件

- [x] Agent 能基于用户选定的角色分工文档回答并引用准确版本。
- [x] Agent 无法通过 Drive Tool 修改资料，也无法通过 Workspace Path 绕过。
- [x] Session 回放可以重建每次模型看到的资料内容与来源。

## 阶段 5：部署加固与可选知识检索

- [ ] 认证反向代理、TLS、用户身份、CSRF 和租户隔离。
- [ ] S3/MinIO/NAS Provider。
- [ ] 备份、恢复、留存策略、指标和告警。
- [ ] 杀毒/CDR Provider 接口。
- [ ] 全文索引继承 File/Version 删除和权限语义。
- [ ] 文档级权限过滤验证完成后才启动向量 Embedding/RAG。

## 当前开发批次

本批次只认定以下 Phase 2C 上传体验范围，未完成项不得提前标记为阶段完成：

1. 建立有界多文件队列和最多 2 项并发的调度状态机。
2. 通过同源 XHR 提供逐项上传进度、取消和明确的 Host `201` 成功边界。
3. 提供 queued/uploading 取消、failed/cancelled 重试，以及 succeeded/cancelled 清理。
4. 保证一项失败不阻塞后续项，且已提交成功不会因 Refresh 失败变成重复上传入口。
5. 以严格覆盖率、真实浏览器和完整仓库门禁验收，再提交独立功能分支。

原生 Safari 26.3.1、正式品牌/协议输入和 Phase 5 部署加固不属于本批次已完成范围。

## 决策与遗留风险

- **协议原文缺失**：当前“低空安全”只转化为控制面/数据面分离、最小权限、审计和默认拒绝，不能宣称满足某一正式行业协议。
- **Harness 版本风险**：当前为开发者预览 `0.1.2-alpha.1`，后续同步上游必须通过 Adapter 与集成测试，不直接追随每日主干。
- **云服务命名风险**：阶段 1–4 是本地回环资料盘；未完成阶段 5 前，不具备真正多用户企业云盘能力。
- **DOCX 保真风险**：浏览器预览与 Word 可能存在差异；LibreOffice 转 PDF 仅作为后续可选沙箱 Provider。
- **第三方许可证风险**：MinerU 为 AGPL-3.0；`dsh-file-explorer` 检查时仓库未跟踪 LICENSE；任何源码复用必须再次审查并记录 Notices。
