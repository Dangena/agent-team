# Agent Team Desktop MVP Backlog

## 产品主线

用户打开桌面端后，在左侧添加项目工作区，在右侧配置 1、2 或 3 个 Codex、Claude Code、
OpenCode、MiMo Code、Zcode 或 Generic CLI Agent 窗口，并把团队配置为执行、规划/审查+执行、
或规划+执行+审查。Agent 通过
Desktop Bridge 通信；smux/tmux bridge 语义用于兼容现有 skill 和提示词习惯。任务完成必须
留下 diff、测试、审查和人工确认记录。

MVP 交付两个桌面版本：macOS 版和 Windows 版。两者共享核心协议和 UI，不做 Android。

## P0：开工前必须固定

- Agent Team Core：定义 role、task、review、approval、evidence、audit 的 TypeScript 类型和 Zod schema。
- Bridge 边界：确定 `agent-team-bridge` 的 Unix Socket/Named Pipe 协议、令牌、ACK 和幂等规则。
- Adapter 契约：固定 Codex、Claude Code、MiMo Code、OpenCode、Generic 的检测和启动接口。
- 平台边界：固定 macOS PTY/Unix Socket/Finder/Menu Bar 和 Windows ConPTY/Named Pipe/Explorer/System Tray 的差异接口。
- 权限原则：不自动批准 CLI 权限提示，不默认添加 `--trust`、`--dangerously-*`、`--never-ask`。
- 工作树锁：MVP 一个共享工作树只能有一个 executor。

## P1：内部预览必须交付

### 工作区

- 导入本地文件夹，显示名称、路径、Git 分支、dirty 状态和最近打开时间。
- 左侧可切换多个工作区；每个工作区最多一个活跃会话。
- 工作区路径移动或删除后只读打开，并要求用户重新定位。

### Agent 窗口

- 中间画布支持 1-3 个 Agent 终端窗口，每个窗口包含 CLI、角色、状态和真实终端。
- 右侧支持编辑 Agent 团队数量和各角色 CLI，创建窗口后配置面板自动折叠。
- Todo List 自动从对话和 Bridge 状态推断，不提供手动新增入口。
- 支持 Codex、Claude Code、MiMo Code、OpenCode、Generic CLI Adapter 检测和诊断。
- 支持启动、停止、重启、resize、最大化、人工接管和恢复自动编排。
- 角色可切换，但活动任务中的 planner/executor 需要先暂停或交接。

### Bridge 与编排

- Planner 可创建任务并分配给 executor；executor 必须 ACK 后才能进入进行中。
- Executor 完成后必须提交变更摘要、测试结果和风险。
- Reviewer 可提交 findings、test gaps 和 approve/change 建议。
- Planner 只有在验收门禁通过后才能批准任务。
- Bridge 消息投递支持 inbox cursor、ACK、超时提醒和重启后重放。

### 证据与审计

- 记录任务开始与验收时的 Git diff。
- 测试命令必须由用户确认后执行，并记录命令、cwd、退出码、耗时和日志。
- blocker/high finding 未关闭时禁止批准，除非用户留下豁免原因。
- 人工接管、角色切换、终止、门禁覆盖都写入审计日志。

## P2：预览后再做

- Git worktree 多 executor 并发。
- 后台 daemon 和系统重启后的 PTY 恢复。
- Linux 与 Android 评估。
- macOS/Windows 签名、公证、自动更新和公开发布。
- 公开遥测、云同步、团队协作和远程 Agent Host。
- Git commit、push、PR 自动化。
- Remote Gateway：本机浏览器/局域网浏览器远程控制桌面端会话，参考 `docs/opencodex-research.md`
  的安全边界，默认关闭。

## 验收口径

- 新用户在 macOS 或 Windows 上 3 分钟内完成导入项目、添加两个 Agent、指定角色并启动终端。
- Fake CLI 能走通“规划 -> 执行 -> 审查 -> 退回 -> 修复 -> 测试 -> 批准”。
- 100 条 Bridge 消息无丢失、重复或乱序。
- 所有 approved 任务都有 diff 查看记录，以及测试证据或用户豁免。
- Renderer 没有文件系统、进程启动或通用 IPC 能力。
- 若开启远程模式，未认证 HTTP/WebSocket 请求必须被拒绝，本机文件预览必须经过 allowlist 或短期 token。
