# Agent Team Desktop 详细开发方案

版本：0.4  
目标：开发人员无需再做产品或架构选择即可开始实施。

## 1. 固定决策

- 保留原 `agent-team/` skill 和 tmux 工作流，桌面端只在 `agent-team-desktop/` 内开发。
- 先抽象 Agent Team Core：角色、消息、Bridge、证据和验收门禁从 skill 中沉淀为桌面端协议。
- 同时规划 macOS 版和 Windows 版；首版为内部预览，不包含签名公证和自动更新。
- Electron + React + TypeScript + Vite + pnpm workspace。
- xterm.js 展示真实终端，node-pty 托管 CLI，SQLite WAL 保存结构化数据。
- MVP 使用 Desktop Bridge，并提供 smux/tmux bridge 兼容层；不得依赖解析终端屏幕文本推进任务状态。
- 当前确认的首版 UI 支持 1、2、3 人 Agent 团队；observer 和 4 窗口布局后移。
- 当前 UI 映射：1 = executor；2 = planner/reviewer + executor；3 = planner + executor + reviewer。
- 每工作区最多一个活跃会话，全局默认最多三个；关闭窗口后托盘继续运行。
- 自动派发、审查和退回；首次启动、验证命令、危险操作、最终结束由用户确认。

## 2. 工程结构

```text
agent-team-desktop/
  apps/desktop/
    src/main/             # Electron 生命周期、托盘、IPC、数据库
    src/preload/          # 最小权限 contextBridge
    src/renderer/         # React UI
  packages/
    agent-team-core/       # 角色契约、消息契约、验收门禁和提示词模板
    protocol/             # Zod schema、领域类型、事件定义
    orchestrator/         # 状态机、角色权限、验收门禁
    agent-host/           # PTY、Bridge Socket、进程管理
    cli-adapters/         # Codex/Claude/MiMo/OpenCode/Generic
    persistence/          # SQLite schema、migration、repository
    test-fixtures/        # Fake CLI 与确定性场景
    platform/             # macOS/Windows 路径、PTY、托盘、文件管理器和打包差异
  resources/
    bin/agent-team-bridge
    prompts/
  docs/
```

Main 与 Agent Host 通过 Electron Utility Process 的消息通道通信。Renderer 只能通过 Preload
暴露的逐方法 API 访问系统能力；禁止暴露通用 `ipcRenderer.send`、shell 或文件 API。

`agent-team-core` 不依赖 Electron、PTY 或 SQLite，便于在桌面端、CLI 兼容入口和测试夹具中
共享同一套角色、消息和验收规则。

平台差异放入 `platform/` 和 Electron main/agent-host 的窄接口中。Renderer 不写平台分支；
UI 只消费统一能力，例如 `openInFileManager`、`createBridgeEndpoint`、`defaultShell`、
`spawnPty` 和 `trayBehavior`。

## 3. 领域模型

### 3.1 核心枚举

```ts
type Role = "planner" | "executor" | "reviewer" | "observer";
type SessionStatus =
  | "draft" | "ready" | "running" | "paused"
  | "completed" | "failed" | "cancelled";
type TaskStatus =
  | "backlog" | "assigned" | "acknowledged" | "in_progress"
  | "review_pending" | "changes_requested" | "blocked"
  | "approved" | "cancelled";
type AgentStatus =
  | "stopped" | "starting" | "ready" | "busy"
  | "waiting_input" | "taken_over" | "crashed";
```

所有 ID 使用 ULID，时间使用 UTC ISO 8601；数据库内部时间字段统一存毫秒时间戳。

### 3.2 数据表

- `workspaces`：规范化路径唯一、名称、Git 检测结果、最近打开时间。
- `sessions`：工作区、初始目标、状态、基线 HEAD/branch、开始结束时间。
- `agent_profiles`：Adapter、可执行文件、参数、模型、显示配置，不保存密钥。
- `agent_instances`：会话、Profile、角色、状态、PID、收件箱游标。
- `tasks`：父任务、目标、scope JSON、acceptance JSON、负责人、状态、版本号。
- `events`：不可变事件信封、payload JSON、创建时间；`event_id` 唯一实现幂等。
- `deliveries`：事件、接收 Agent、投递/读取/ACK 时间和失败原因。
- `evidence`：diff/test/log/review/waiver、摘要、artifact 路径、SHA-256。
- `audit_entries`：人工接管、角色切换、终止、门禁覆盖和设置变更。

SQLite 使用 WAL、外键和显式 migration。结构化 payload 上限 64 KiB；超过后写入会话 artifact
目录。终端日志按 Agent `10 MB x 5` 滚动，元数据默认不自动删除。

## 4. 状态机与权限

### 4.1 会话

`draft -> ready -> running <-> paused -> completed`，任何活动状态可进入 `failed/cancelled`。
`ready` 要求 Planner 和 Executor 均存在且 CLI 检测通过。`completed` 只能由用户在所有任务
approved/cancelled 后确认。

### 4.2 任务

`backlog -> assigned -> acknowledged -> in_progress -> review_pending -> approved`。
Reviewer/Planner 可从 `review_pending` 进入 `changes_requested`，Executor 修复后重新进入
`review_pending`。Agent 崩溃、权限等待或依赖缺失进入 `blocked`，恢复后回到原状态。

### 4.3 权限矩阵

- Planner：创建/分配任务、请求审查、请求变更、批准任务、提议测试。
- Executor：ACK、开始、阻塞、提交完成报告、回复变更请求。
- Reviewer：提交 review 和 finding，不得批准、分配或变更任务。
- Observer：只读事件，不参与状态转换。
- 用户：可暂停、终止、切换角色、执行测试、豁免门禁和结束会话。

共享工作树的 Executor 锁由数据库事务和内存运行时双重检查。Planner/Reviewer 优先使用 CLI
原生只读模式；不支持时标记为“策略只读”，发现其期间产生文件变化立即告警。

## 5. Desktop Bridge 协议

### 5.1 环境变量

```text
AGENT_TEAM_SOCKET=<unix socket or named pipe>
AGENT_TEAM_SESSION_ID=<ULID>
AGENT_TEAM_AGENT_ID=<ULID>
AGENT_TEAM_ROLE=<role>
AGENT_TEAM_TOKEN=<随机 256-bit 会话令牌>
```

macOS 使用 Unix Domain Socket，Windows 使用 Named Pipe。通信端点只允许当前用户访问。令牌
只存在于运行时环境和内存，不写日志或数据库。

### 5.2 命令接口

```text
agent-team-bridge inbox [--after CURSOR]
agent-team-bridge ack EVENT_ID
agent-team-bridge task create --file payload.json
agent-team-bridge task assign TASK_ID --to AGENT_ID
agent-team-bridge task start|block|complete TASK_ID --file report.json
agent-team-bridge review request|report TASK_ID --file report.json
agent-team-bridge approval approve|request-changes TASK_ID --file result.json
agent-team-bridge test propose TASK_ID --file commands.json
```

传输使用一行一个 JSON request/response。每个 request 包含 `requestId/protocolVersion/token/agentId/
command/payload`。服务端先验证令牌、Agent、角色和状态转换，再以单事务写 event 和 delivery。
相同 requestId 重试必须返回原结果，不重复推进状态。

Orchestrator 只向预期处于等待状态的目标 PTY注入简短通知，详细内容由 Agent 调用 `inbox`
读取。一次只允许一个未 ACK 的自动通知；人工接管期间仅排队，不向终端自动输入。

兼容层可提供 `read/message/type/keys/resolve` 形状的命令，方便原 agent-team prompt 和用户
习惯迁移。兼容命令只负责人机可见的终端输入，不允许直接推进任务状态；状态推进必须走
结构化 `task/review/approval/evidence` 命令。

## 6. CLI Adapter

每个 Adapter 必须实现 `detect`、`buildLaunchSpec`、`buildRolePrompt`、`capabilities`、
`classifyExit`。启动参数必须使用数组，禁止拼接 shell 字符串。

- Codex：使用 `-C <workspace>`；Planner/Reviewer 默认 `--sandbox read-only`，不添加危险 bypass。
- Claude Code：使用 `--append-system-prompt` 和 `--name`；只读角色优先 `--permission-mode plan`。
- MiMo：使用项目路径和 `--prompt`；不得默认添加 `--trust` 或 `--never-ask`。
- OpenCode：Adapter 保留完整检测和诊断；本机缺失时禁止启动，不负责安装。
- Generic：用户配置 executable、args、env allowlist 和初始提示词；默认 Observer。

Windows Adapter 必须显式记录运行环境：原生 Windows、PowerShell、Git Bash 或 WSL。不得在用户
不知情的情况下把工作区路径映射到 WSL 或改变 CLI 执行环境。

Adapter 检测输出路径、版本、支持能力和错误原因。版本未知时允许人工终端启动，但禁止自动
编排，直到通过 Adapter 冒烟验证。

## 7. Electron API 与数据流

### 7.1 Preload API

```ts
workspace.list(); workspace.import(); workspace.remove(id);
session.create(input); session.start(id); session.pause(id); session.finish(id);
agent.create(input); agent.start(id); agent.stop(id); agent.resize(id, cols, rows);
terminal.write(agentId, data); terminal.subscribe(agentId, callback);
task.list(sessionId); event.list(sessionId, cursor); evidence.list(taskId);
test.approve(proposalId); test.reject(proposalId);
```

每个输入使用 Zod 校验，Main 校验 IPC sender 来自本地打包页面。终端事件订阅必须返回取消
函数，防止切换工作区后监听器泄漏。

### 7.2 任务数据流

1. 用户创建会话，Main 记录 Git 基线并启动 Agent Host。
2. Host 为每个 Agent 建立 PTY、角色提示词和 Bridge 环境。
3. Planner 通过 Bridge 创建并分配任务，事务写入事件后通知 Executor。
4. Executor ACK/完成后，Main 捕获 diff；Reviewer 收到 review request。
5. Planner 提议验证命令，UI 展示命令、cwd 和风险，用户确认后 Test Runner 执行。
6. Planner 只有在 blocker/high finding 关闭、diff 已查看、测试 verified 或存在 waiver 时才能批准。
7. 所有任务结束后用户确认完成会话，Host 依次终止 Agent 并关闭 Socket。

## 8. UI 交付细节

- 工作区侧栏显示名称、分支、dirty、活跃 Agent、会话状态；后台运行项目显示进度点。
- Agent 窗口头部显示 CLI、角色和状态；正文为 xterm.js。
- 当前 UI 支持 1/2/3 人布局：1 为 executor，2 为 planner/reviewer + executor，3 为 planner + executor + reviewer。
- 右侧包含可折叠团队配置、自动 Todo List 和 Bridge 收件箱。
- Tasks、Diff、Tests、Reviews、Audit 后续通过结构化事件和证据记录进入右侧或详情视图。
- 所有危险或不可逆操作使用明确对象和后果的确认框，不使用模糊“确定”。
- CLI 缺失、崩溃、等待权限、消息未 ACK、异常写入均使用不同状态，不合并为通用 error。

## 9. 异常与恢复

- CLI 非零退出：记录退出码和尾部日志，Agent 标记 crashed，关联任务标记 blocked。
- Bridge 断线：事件保留在数据库，重连后从最后 ACK cursor 继续。
- Main/Host 崩溃：下次启动把原 running session 标记 paused，把活动任务标记 blocked。
- 工作区被移动或删除：会话只读打开，要求用户重新定位，不自动猜测路径。
- Git HEAD/branch 被外部改变：暂停自动验收并要求用户确认新基线。
- 全局会话达到三个：禁止启动第四个，列出可暂停或结束的会话。
- 真正退出应用：必须选择取消退出或终止所有活跃 Agent，不允许静默遗留进程。

## 10. 测试与发布门禁

### 单元测试

- 所有合法/非法状态转换、权限矩阵、单 Executor 锁和验收门禁。
- Adapter 参数、含空格路径、环境变量过滤、版本解析和危险参数拒绝。
- Bridge schema、鉴权、ACK、cursor、幂等、超限 artifact 和事件重放。

### 集成测试

- Fake CLI 的启动、resize、输入、退出、崩溃、权限等待和人工接管。
- SQLite migration、事务失败回滚、恢复、日志滚动和路径逃逸拒绝。
- Test Runner 的确认、退出码、超时、取消和日志证据。

### 端到端测试

- 导入 -> 双 Agent -> 规划 -> 执行 -> 审查 -> 退回 -> 修复 -> 测试 -> 批准 -> 结束。
- 切换工作区后后台继续、托盘恢复、三会话上限、Agent 崩溃和应用异常恢复。
- 本机 Codex、Claude Code、MiMo 各完成一次真实冒烟；OpenCode 缺失时验证诊断路径。

发布门禁：100 条 Bridge 消息无丢失/重复/乱序；四终端运行两小时无不可控资源增长；
Renderer 无系统权限泄漏；所有已批准任务具备 diff 记录及 verified 测试或 waiver。

## 11. 实施顺序与工作量

1. 技术验证与 ADR：3-5 天。
2. 工程、IPC、SQLite、安全底座：4-5 天。
3. 工作区、Adapter、PTY、终端和托盘：5-6 天。
4. 状态机、Bridge、角色和任务流：6-8 天。
5. Diff、Test Runner、审查、恢复和审计：5-6 天。
6. 内部预览打包、真实冒烟和稳定性：3-4 天。

单人总计 6-8 周，其中 macOS 版先完成端到端闭环，Windows 版随后补齐同等能力和平台冒烟。
多 Executor、Git worktree、后台 daemon、Linux、Android、签名公证、自动更新、云同步和远程
执行全部推迟到后续版本或独立产品形态。
