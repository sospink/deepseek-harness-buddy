# Agent Note: 定位安全 Agent 云盘资料库——以独立文档数据面替代多 Agent 协作

Status: proposed

[English](2026-08-29-safety-agent-drive-library.md) | 中文

## 问题

Buddy 分支需要一个参考低空安全协议概念的“定位安全 Agent”产品模式。当前需求取消三角多 Agent 协作体验，改为一个独立云盘/资料库：用户可以上传角色分工文档以及 Markdown、PDF、DOCX 文件，浏览并在线预览。沟通、邮箱、多人共编、轻量发布、向量 RAG 和多用户协作不属于第一期交付。

当前仓库和已提供的本地调研资料中没有找到名为“低空安全协议”的规范性文档，也没有找到原“三角协作”的精确定义。因此，本提案把它作为设计约束而非合规声明：控制面与文档数据面分离、最小权限、保留来源与审计事实、失败时默认拒绝。如果外部协议规定了强制角色、字段、留存、分级或审批规则，必须在实现前提供该文档，才能把这些规则纳入验收标准。

## 当前 Harness 的能力证据

现有包可以作为底座，但没有任何一个等同于云盘资料库：

- [`dsh-workspace`](../../../../packages/workspace/workspace/README.zh.md) 记录规范化本地目录、标题和有序 Session，只管理登记关系，不拥有文件、文件夹、上传、预览或模型上下文。
- [`dsh-attachment`](../../../../packages/attachment/attachment/README.zh.md) 是不可变、内容寻址的图片存储，类型面仅接受 PNG、JPEG、WebP 和 GIF，浏览器附件 UI 也明确没有非图片界面。
- [`dsh-client-ui-deliverables`](../../../../packages/client/ui-deliverables/README.zh.md) 从 Session 中推导执行期间产出的文件路径并打开工作区路径，不是资产注册表，不能表达上传资料、文件夹、版本和留存策略。
- [`dsh-storage-domain`](../../../../packages/storage/storage-domain/README.zh.md) 适合保存类型化元数据，但当前 Storage 后端契约提供的是键值文档，不是大二进制对象存储。
- [`dsh-host-webserver`](../../../../packages/host/webserver/README.zh.md)、Typert Remote 网关、Client 模块加载器和类型化 Slot 系统，已经提供实现 Host/Client 双面云盘插件所需的传输与 UI 扩展点。
- [`dsh-experimental-agent-team`](../../../../packages/experimental/agent-team/README.zh.md) 拥有持久化成员表、任务 DAG 和邮箱；这些正是当前产品模式明确排除的协作概念，因此云盘不能依赖或挂载 Agent Team 包。

## 产品决策

第一版产品由一个人类控制的资料库和一个普通 Harness Agent Preset“定位安全 Agent”组成。它不是 Team，不包含同伴成员表、任务板、邮箱或 Agent 间通信。资料库是从侧栏进入的独立应用界面，对话仍然是另一个独立模式。

低空安全类比落到四条可执行规则：

1. **控制面**——元数据修改、上传准入、删除、版本发布和 Agent 写入审批都是 Host 权威操作。
2. **数据面**——不可变 Blob 和派生预览只通过不透明 id 定位，绝不暴露为用户可选择的文件系统路径。
3. **观测面**——每个被接受的修改都记录操作者、操作、目标、时间、适用时的上一版本和稳定关联 id。
4. **默认拒绝的策略面**——未知格式、签名无效、超配额、预览转换不安全和权限无法确定时都拒绝，且不发布文件记录。

## 新能力与包边界

应新增独立的 `drive` capability seam，而不是扩宽 Workspace、Attachment 或 Deliverables。分支自有包放在新的 `packages/buddy/` 组下并使用 `@sospink/dsh-buddy-*` scope，避免以 DeepSeek 命名空间发布。仓库约束脚本只对该分支自有组放行这个 scope。

| 包 | 职责 |
|---|---|
| `@sospink/dsh-buddy-drive` | Service Definition、品牌化 id、实体、错误、事件、限制，以及对资料库、文件夹、文件和版本的提供方无关操作 |
| `@sospink/dsh-buddy-drive-local` | 本地提供方：原子 Blob 发布、通过 `ctx.storageDomain` 完成元数据事务、预览缓存、配额统计、启动校验和恢复 |
| `@sospink/dsh-buddy-api-drive` | Typert Remote 元数据命令和可重连增量流；为流式二进制提供同源 HTTP 上传与内容路由 |
| `@sospink/dsh-buddy-client-ui-drive` | 侧栏入口、独立云盘界面、文件夹树、文件表格、上传队列、元数据编辑器和预览面板 |
| `@sospink/dsh-buddy-tool-drive` | 可选模型 Consumer：第一版只提供只读 list/search/read，后续再提供分阶段的新版本写入 |
| `@sospink/dsh-buddy-drive-app` | 在原生 Web bundle 之后挂载 Host、Client、Controller 和可选工具包的 bundle patch |

`ctx.drive` 是唯一面向产品的 Host 服务。本地提供方同时拥有元数据与介质语义；Consumer 不能直接调用 `node:fs`、`ctx.storage.backend` 或 Blob 目录。这样未来替换为 S3、MinIO、NAS 或企业对象存储时，无需修改 UI 或 Agent 工具。

## 持久化模型

第一版包含一个默认资料库、任意文件夹、不可变文件版本和软删除墓碑。稳定 id 与展示名称无关，均由系统生成。

```ts
interface DriveFile {
  readonly id: DriveFileId
  readonly libraryId: DriveLibraryId
  readonly parentId?: DriveFolderId
  readonly name: string
  readonly kind: 'role-assignment' | 'safety-protocol' | 'operating-rule' | 'reference' | 'general'
  readonly mediaType: 'text/markdown' | 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  readonly currentVersionId: DriveVersionId
  readonly tags: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
  readonly deletedAt?: string
}

interface DriveVersion {
  readonly id: DriveVersionId
  readonly fileId: DriveFileId
  readonly digest: `sha256:${string}`
  readonly bytes: number
  readonly createdAt: string
  readonly actor: 'human' | 'agent'
  readonly source: 'upload' | 'agent-publication'
  readonly preview: 'pending' | 'ready' | 'unsupported' | 'failed'
}
```

元数据使用带版本号的 `buddy_drive` Storage Domain。二进制数据位于 Web Root 之外的 `$DSH_HOME/buddy-drive/blobs/sha256/<prefix>/<digest>`，发布流程为临时文件写入、`fsync`、摘要校验和原子重命名。原始文件名只作为元数据存在。派生预览缓存以源摘要、渲染器名称、渲染器版本和策略版本为键，避免库升级后静默复用不兼容预览。

相同字节可以共享一个 Blob，但每次上传仍创建独立版本记录和审计事实。删除先隐藏文件记录，随后在保留窗口结束后异步回收无引用 Blob；它绝不删除任意工作区路径。

## 传输与 UI 组合

列表、建文件夹、重命名、移动、分类、删除、恢复和版本历史等元数据方法使用 Typert Remote。二进制上传不能以 Base64 放进 Remote JSON，因为这会重复占用内存并破坏流式传输。Host 注册同源上传和内容路由，执行严格 HTTP 方法检查、有界请求流、取消和确定性错误。

内容路由只接受不透明文件/版本 id，并为 PDF.js 支持 `GET`、`HEAD` 和字节范围。响应提供校验后的媒体类型、独立编码展示文件名的 `Content-Disposition: inline`、`X-Content-Type-Options: nosniff`、严格内容安全策略，以及在缓存策略明确前的 private/no-store。路由从不接受文件系统路径。

现有布局已经声明 `sidebar.footer.action` 列表和 `shell.overlay` 界面。云盘插件应在侧栏注册“资料云盘”入口并打开全应用 Overlay，而不是替换单一所有者的 Workspace Slot 或重写根 Shell。Overlay 内含文件夹栏、可排序/搜索的文件表格和预览栏，关闭后返回未修改的对话界面。这样可以形成真正独立的云盘模式，同时把上游布局改动限制到最低。

## 预览流水线

### Markdown

只解码经过校验且有界的 UTF-8 文本，并复用现有 [`MarkdownText`](../../../../packages/client/ui-primitives/src/markdown/MarkdownText.tsx) 组件。它已经把不可信 Markdown 渲染为 React 元素，并禁用原始 HTML、相对链接和不安全协议。云盘包装层默认进一步禁用远程图片，后续策略可以增加显式 Host 白名单。源码和渲染结果以两个标签页展示。

### PDF

使用分支自有、重新设计外观的 PDF.js Viewer，并通过支持 Range 的内容路由读取。PDF.js 提供 Display 和 Viewer 层，可从二进制或 URL 打开文件；页面虚拟化避免一次以高分辨率渲染整份长文档。预览不运行 PDF 中嵌入的 JavaScript，外部 URL 操作必须由用户显式点击，下载是单独的授权命令。

### DOCX

使用 `docx-preview` 在带 sandbox 的 iframe 或隔离文档中实现视觉预览。配置 `renderAltChunks: false`，禁止外部资源拉取，在销毁时回收对象 URL，限制链接协议，并在渲染前限制 ZIP 条目数和解压总字节，超时则终止预览。它稳定的 `renderAsync` 入口把 DOCX 渲染为 HTML，比纯语义转换保留更多页面布局。

另行在有界 Worker 中运行 Mammoth，为搜索和 Agent 阅读提取经过清洗的语义 HTML 或纯文本。Mammoth 明确不清洗输出，并警告外部文件与异常性能风险，因此输出必须经过严格 Sanitizer，`externalFileAccess` 保持关闭，Worker 具备 CPU、时间和内存限制。Mammoth 输出不是主视觉预览。

## 上传与预览安全

第一版只接受 `.md`、`.markdown`、`.pdf` 和 `.docx`；ZIP、HTML、SVG、可执行格式、带宏 Office 格式、旧版 `.doc` 和任意扩展名兜底全部拒绝。浏览器声明的 MIME 仅作提示。准入同时验证规范化扩展名、文件签名和容器结构：PDF 必须有合法 PDF 签名，DOCX 必须是包含预期 Word 条目的 OOXML ZIP，Markdown 必须是有界有效 UTF-8 且不能呈现二进制控制字符密度。

默认单文件 50 MiB、单资料库 2 GiB、每浏览器四个并发上传，并设置请求超时、DOCX 最大条目数、最大解压字节和最大压缩比。所有值均可部署配置，并由 Host 重新校验。存储文件名使用系统 id/摘要，不使用用户文本。预览解析器在 Worker 或隔离子进程运行，不接收可写工作区路径。

第一期 Web bundle 保持仅回环地址。Harness Web Server 在绑定 `0.0.0.0` 时自身没有认证或 TLS，因此不能仅添加 trusted Host 就视为可安全局域网部署。后续网络部署必须先具备带认证的反向代理、TLS、用户身份、每条命令与内容请求的权限校验、CSRF 防护和租户隔离存储，才能称为真正云服务。

上传文档属于不可信模型数据，任何内容都不能自动注入 Agent Prompt。用户必须显式选择文件，或由 Agent 调用有界 read/search 工具；返回结果带文件 id、版本 id、名称、分类和来源标记，系统指令明确文档文本是证据而不是可执行指令。第一版 Agent 工具完全只读；后续 Agent 发布采用待审批的新版本，不能直接覆盖当前版本。

## 第三方插件评估

社区目录中存在有价值的参考，但没有一个可以直接作为本需求的生产基线。

| 候选 | 可借鉴证据 | 不直接作为云盘安装的原因 |
|---|---|---|
| `dsh-files` 0.4.0，声明 MIT | 展示了 Composer 上传、内容嗅探、PDF/DOCX/XLSX 提取、配额和 `read_document` 工具 | 文件是 `.dsh-filess` 下的 Session 隔离临时工作区资产，采用 TTL 且耦合对话输入；没有全局资料库、文件夹模型、版本历史、独立 UI 或持久治理 |
| `dsh-file-explorer` 0.1.3，package 声明 MIT | 展示了文件树、Markdown/文本预览和 `shell.overlay` 接入 | 它是宽权限工作区文件浏览/编辑器，具有写入和打开 VS Code 路由，并接受路径；检查到的仓库也没有跟踪 LICENSE 文件，这与不透明 id、以只读为主的文档数据面方向相反 |
| `dsh-univer-office` 0.2.10，Apache-2.0 | 提供丰富 Office 导入、实时编辑、草稿、审阅和导出 | 它是远大于当前范围的 Office 创作 Runtime，包含 Pro/Native/Gateway 依赖，并精确锁定较老 Harness Peer；当前需求只是上传和预览，不是 Office 编辑或多 Agent Worktree |
| `@huanlin/dsh-plugin-mineru` 0.2.4，AGPL-3.0 | 文档转 Markdown 可以增强后续索引 | 它增加外部解析流程和强 Copyleft 义务，但不提供云盘数据模型或主浏览器；复用前必须完成法律、部署和数据外传评审 |

推荐策略是借鉴模式与测试，而不是把整个插件拼入产品 Profile。任何源码复用都必须记录许可证与 Notices、锁定已审查 Commit、通过新 Seam 适配，并针对本分支 `0.1.2-alpha.1` 基线完成兼容性和安全测试。

## 交付顺序

### 阶段 0——产品基线与威胁模型

创建 `develop` 和功能分支，锁定上游 Commit，增加分支自有 Package Scope 规则，把缺失的低空协议记录为外部依赖，并准备恶意上传 Fixture。导航线框、允许格式、配额和仅回环部署规则通过评审后退出本阶段。

### 阶段 1——持久化云盘核心

实现 id、实体、Storage Domain Schema、本地 Blob Provider、原子上传准入、文件夹、元数据列表/搜索、重命名/移动、软删除、恢复、版本历史、审计记录和启动恢复。重启后全部记录保留、重名和重复字节行为确定、中断写入可恢复，并且路径穿越/符号链接测试不能逃逸介质根目录后退出本阶段。

### 阶段 2——独立 UI 与在线预览

实现侧栏入口、全屏云盘 Overlay、上传队列、文件夹/文件浏览、元数据分类、Markdown 源码/渲染视图、支持 Range 的 PDF.js、隔离 DOCX 视觉渲染、下载和错误态。中英文 Markdown/PDF/DOCX 代表 Fixture 能在 Chrome 和 Safari 预览、大文件资源有界、预览失败不丢失原文件后退出本阶段。

### 阶段 3——定位安全 Agent 接入

新增 Agent Preset 和只读 `drive_list`、`drive_search`、`drive_read` 工具，要求显式选择、带来源、限制输出并进行 Prompt Injection 边界包装。不挂载 Agent Team 成员表、任务板、邮箱或通信 UI。Agent 能基于选定角色文档回答、引用文件/版本来源、无法修改云盘，且文档不会在缺少用户动作或工具调用时进入模型后退出本阶段。

### 阶段 4——加固与可选知识检索

增加杀毒/CDR 接口、认证反向代理部署、授权角色、留存策略、指标、备份和全文索引。只有在文档级权限过滤与删除传播被证明正确后才能开始向量 Embedding 与 RAG；它们不是实现首期云盘效果的必要条件。

由一名有经验的全栈工程师完成阶段 0–3 并包含评审，现实估算为五到七周；增加第二名工程师主要通过并行 Host/UI 和安全测试缩短日历时间。该估算不包含企业身份系统、远程对象存储、多用户分享、Office 编辑、OCR 和生产级 RAG。

## 验收标准

- 产品提供独立“资料云盘”模式，并且该模式中没有三角 Team、成员表、任务板、邮箱或 Agent 通信界面。
- 用户可以创建文件夹，上传角色分工、安全协议、操作规程、参考资料或普通 Markdown/PDF/DOCX 文档，并可重命名、移动、分类、下载、软删除、恢复和查看版本历史。
- Markdown、PDF 和 DOCX 可以在浏览器内在线预览，无需打开外部桌面应用；预览失败被隔离且原文件仍可下载。
- 所有二进制路由使用不透明 id、严格方法、有界流、已校验媒体类型、Origin/Host 检查，并且不接受用户提供的文件系统路径。
- 文件名穿越、符号链接逃逸、MIME 欺骗、双扩展名、超大上传、PDF 解析失败、DOCX ZIP Bomb、DOCX 外部关系和恶意 Markdown/HTML Fixture 都有拒绝或安全渲染测试。
- 重启、中断发布、重复上传、并发上传、配额、Range 读取、删除/恢复和垃圾回收行为具有 Host 集成测试。
- Client Slot 注册、重连、上传进度、键盘导航、预览加载/错误和窄窗口行为具有聚焦 Client 测试和无密钥 Web Snapshot。
- 定位安全 Agent 只读取显式选择或工具请求的版本，报告来源并遵守输出预算，没有直接修改操作。
- 自定义 Bundle 可以在不改变原生 Harness Package 的情况下关闭，仍可 Fetch/Merge 上游 `master`，分支自有代码被限制在文档规定的 Package 和少量组合改动中。

## 曾考虑的替代方案

### 把 Attachment 扩展为所有文件类型

拒绝，因为 Attachment 是模型消息的图片路径，拥有图片归一化和请求 Variant。云盘需要文件夹、分类、版本、删除/恢复、审计、派生预览和独立生命周期。扩宽 Attachment 会耦合无关生命周期并破坏上游模型 API 的稳定性。

### 把 Workspace 文件夹直接当云盘

拒绝，因为 Workspace Path 是用户执行区，文件系统工具和 Shell 命令可以访问。受治理资料库不能继承任意写入、代码执行、编辑器启动或路径身份。后续可以新增受审查命令，在云盘与工作区间显式导入/导出。

### 同时安装 `dsh-files` 和 `dsh-file-explorer`

拒绝作为目标架构。该组合可以快速演示，但会留下两套路径型存储、Session TTL 语义、宽权限工作区写入路由，并且没有权威资料库模型、一致留存和审计。它们适合借鉴 PoC，不适合作为持久产品边界。

### 第一版直接采用 Univer

拒绝，因为创作、Gateway、Pro/Native 依赖、草稿和审阅界面远超上传与预览范围。它仍可作为后续可选编辑 Provider，经评审 Adapter 接入。

## 风险与开放问题

- 低空安全协议、原三角角色和角色分工文档的强制字段仍未明确；在拿到外部原文前不能声称符合领域协议。
- Harness 仍处于开发者预览，本分支当前为 `0.1.2-alpha.1`，Client Slot 和 Package API 可能变化；必须使用分支自有 Adapter 和锁定版本的集成测试。
- DOCX 保真与安全存在冲突。默认视觉路径是隔离的 `docx-preview`，但复杂文档可能与 Word 不同。未来使用 LibreOffice 转 PDF 可提高保真度，但会引入大型、必须沙箱化的 Native 依赖。
- 本地磁盘加回环 UI 是个人资料盘，不是真正云服务。在具备身份、远程对象存储、备份、分享和网络安全之前，产品命名必须区分本地模式。
- 全文提取可能把受限文本泄露到索引或日志。搜索扩展到本地单用户版本之外前，索引记录必须继承文件权限、版本、删除和留存语义。
