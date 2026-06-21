# Agent Team Desktop 实施路线图

## 交付目标

首版交付 macOS 和 Windows 两个内部开发预览版。以单人开发估算 6-8 周，先验证 PTY、Bridge
和状态机，再完成工作区 UI、证据闭环和稳定性。原 `agent-team/` skill 与 tmux 工作流始终
保持可用。

## Phase 0：技术验证（3-5 个工作日）

- 分别在 macOS PTY 和 Windows ConPTY 中并排运行两个 xterm.js + node-pty 实例，验证输入、resize、退出和重启。
- 启动本机 Codex、Claude Code 和 MiMo；OpenCode 使用 Fake CLI 代替，直到本机安装后再冒烟。
- 从 `agent-team/` 提取 Agent Team Core 草案：角色契约、消息契约、Bridge 语义和验收门禁。
- 实现最小 Unix Socket 和 Windows Named Pipe 两条 Bridge 通道，连续投递 100 条事件。
- 验证 smux/tmux bridge 兼容命令只做终端交互，不推进结构化任务状态。
- 验证终端权限提示、长消息、CLI 崩溃、窗口隐藏和托盘恢复。
- 输出 Electron/PTY、SQLite、Bridge、生命周期、Adapter 和平台差异六份 ADR。

退出标准：事件无丢失、重复或乱序；关键任务状态不依赖 ANSI 屏幕文本。

## Phase 1：工程底座（4-5 个工作日）

- 建立 pnpm workspace、Electron、React、TypeScript、Vite、Vitest 和 Playwright。
- 建立 Renderer、Preload、Main、Agent Host 四层进程边界和 typed IPC。
- 建立 SQLite migration、事件追加存储、终端滚动日志和诊断日志。
- 配置 context isolation、renderer sandbox、CSP、IPC sender 校验和路径授权。

退出标准：开发模式和预览包均能启动；Renderer 无直接文件系统或进程能力。

## Phase 2：工作区与终端（5-6 个工作日）

- 实现目录导入、最近工作区、Git 分支/脏状态和会话历史。
- 实现 Claude Code、Codex、MiMo、OpenCode、Generic CLI Adapter。
- 实现 1/2/3 Agent 终端布局、Agent 启停、resize 和异常状态。
- 最大化、人工接管和 4 窗口 observer 布局后移到预览后增强。
- 实现托盘后台运行、每工作区一个活跃会话、全局三个会话限制。

退出标准：用户可在三分钟内导入项目、创建两个角色 Agent 并启动真实终端。

## Phase 3：编排闭环（6-8 个工作日）

- 实现 Session、Task、Review 状态机和角色权限矩阵。
- 实现 Desktop Bridge、会话令牌、收件箱游标、ACK、幂等和大消息 artifact。
- 实现 Planner 拆解、Executor ACK/完成、Reviewer 审查、退回和重新验收。
- 实现单 Executor 锁、角色切换限制、暂停和交接摘要。

退出标准：Fake CLI 可完整走通“规划 -> 执行 -> 审查 -> 退回 -> 批准”。

## Phase 4：证据与恢复（5-6 个工作日）

- 记录 Git HEAD、status、基线 diff 和任务验收 diff。
- 实现验证命令提议、人工确认、独立 Test Runner、退出码和日志证据。
- 实现审查发现、严重度门禁、人工豁免和审计日志。
- 实现异常退出恢复：保留消息和日志，将中断任务转为 `blocked`。

退出标准：已批准任务必须包含 diff 查看记录、验证证据或用户豁免原因。

## Phase 5：内部预览（3-4 个工作日）

- 构建 macOS DMG/ZIP 和 Windows NSIS/ZIP，不把签名、公证和自动更新作为本阶段门禁。
- 完成首次使用、CLI 缺失、故障诊断和数据清理文档。
- macOS 与 Windows 各四终端持续运行两小时，检查事件、PTY、CPU 和内存稳定性。
- 对两平台本机已有 Codex、Claude Code、MiMo 做真实冒烟；OpenCode 安装后补测。

退出标准：在 macOS 和 Windows 的干净内部测试目录完成安装、导入、协作、恢复和安全退出。

## 后续版本

- Phase 2.x：平台体验打磨、后台 daemon、UI 重连和会话模板。
- Phase 3.x：Git worktree、多 Executor、分支合并队列和冲突预检。
- Phase 4.x：签名公证、自动更新、公开发布、Linux/Android 评估、远程 Agent Host 和团队协作。
