# Agent Team Desktop 产品与技术设计

版本：0.4  
状态：详细设计基线  
目标平台：macOS 版与 Windows 版

## 1. 产品定位

Agent Team Desktop 是面向本地软件项目的多 Agent 编排桌面应用。用户在左侧导入一个或多个
项目文件夹作为工作区和对话容器，在中间画布运行 Codex、Claude Code、OpenCode、MiMo Code、
Zcode 或自定义 CLI 窗口，并在右侧把团队配置为执行、规划/审查+执行、或规划+执行+审查。
应用负责进程托管、消息路由、任务
状态、证据留存和人工控制；各 AI CLI 仍通过用户原有的本地安装、登录态和权限体系工作。

产品交付两个桌面版本：macOS 版和 Windows 版。两者共享 Agent Team Core、数据模型、状态机、
Bridge 协议、Adapter 契约和 React UI；平台差异集中在 PTY、Bridge 传输、路径权限、托盘、
文件管理器入口和打包安装。Android 不作为当前产品形态；如后续需要移动端，应定位为远程
控制端，而不是本机运行 CLI Agent 的执行端。

OpenCodex 调研结论记录在 `docs/opencodex-research.md`。它的本机/局域网远程入口、认证、
WebSocket 路由、文件预览 token 和运行时发现模式可作为未来 Remote Gateway 参考；但本项目
不代理官方 Codex Desktop UI，也不复制其 AGPL 实现代码。

它不是新的模型客户端，也不是 IDE。首版聚焦解决以下问题：

1. 多个 CLI Agent 的启动、布局与角色配置分散。
2. Agent 间依赖终端文本互发，消息不可追踪且难以恢复。
3. “已完成”缺少 diff、测试和审查证据。
4. 多执行方共享工作树时容易发生文件覆盖和状态污染。

## 2. 与 agent-team skill 的关系

`agent-team/` 是产品核心协议的来源，同时保留现有轻量 tmux 工作流。桌面端复用其经过验证
的原则：

- Lead 先检查仓库，再拆解和派发任务。
- Worker 按明确的 `OBJECTIVE / SCOPE / ACCEPTANCE` 执行。
- Reviewer 默认只读，输出带严重度的发现。
- Lead 必须检查真实 diff 和测试结果后才能验收。
- Agent 间通信遵守先读取上下文、再发送消息的约束。

桌面端将这些原则抽象为 Agent Team Core，而不是把 tmux pane 当作内部 API：

- Role Contract：planner、executor、reviewer、observer 的职责和权限。
- Message Contract：任务、完成报告、审查结果、退回和批准的结构化格式。
- Bridge Contract：read-before-send、inbox、ack、幂等和大消息 artifact。
- Evidence Contract：diff、测试、审查、豁免和审计记录。

桌面端不直接调用 skill 脚本作为内部 API。两者共享协议概念，但拥有独立实现，避免桌面
产品受 tmux 布局和 shell 脚本数据结构限制。后续可提供“以 tmux 模式打开”兼容入口。

## 3. 用户与核心场景

### 3.1 目标用户

- 同时使用两种以上 AI 编程 CLI 的个人开发者。
- 希望保留人工授权，又需要可重复协作流程的团队。
- 需要对任务、修改、测试和审查过程留痕的技术负责人。

### 3.2 核心流程

1. 用户从左侧菜单导入项目文件夹。
2. 应用检测 Git、可用 AI CLI、默认 shell 和项目技术栈。
3. 用户在右侧选择 1、2 或 3 人 Agent 团队，并为对应角色选择 CLI。
4. 用户输入总任务，规划方生成任务卡并派给执行方。
5. 执行方修改代码、运行测试并提交结构化完成报告。
6. 审查方按需并行做只读审查，规划方汇总结论。
7. 规划方检查 diff、测试证据和审查结果，批准或退回。
8. 用户后续可暂停、接管终端、调整角色或终止会话；这些控制不放在当前原型右上角。

## 4. 界面信息架构

### 4.1 主窗口

```text
+----------------------+--------------------------------------------------+
| 工作区               | 顶部：项目 / 分支 / 会话 / bridge 状态         |
|                      +--------------------------------------------------+
| 项目与对话           | Agent 终端画布                                  |
|  - project-a         | +----------------+ +----------------+            |
|  - project-b         | | Claude Code    | | Codex          |            |
|                      | | 角色：执行     | | 角色：规划     |            |
| 会话历史             | | 状态：工作中   | | 状态：等待     |            |
| 设置                 | | Terminal       | | Terminal       |            |
|                      | +----------------+ +----------------+            |
|                      +----------------------+---------------------------+
|                      | 右侧：团队配置 / 自动 Todo / Bridge 收件箱       |
+----------------------+--------------------------------------------------+
```

首屏不是欢迎页，而是可操作工作台：左侧始终是项目工作区和对话入口，中间始终是 Agent
窗口画布，右侧是团队配置、自动 Todo 和 Bridge 收件箱。用户完成“导入项目 -> 选择团队数量 ->
选择 CLI -> 创建窗口”后即可开始协作。

### 4.2 工作区侧栏

- 导入文件夹、移除引用、在 Finder/Explorer 中显示。
- 显示当前分支、脏工作树提示、活跃 Agent 数和运行状态。
- 工作区下保留多个历史会话；历史会话只读查看。
- 项目文件不复制进应用，工作区记录只保存规范化路径和展示名。

### 4.3 Agent 窗口

每个窗口包含 CLI 类型、角色、运行状态和完整终端。

- 当前确认的首版 UI 支持 1、2、3 人布局。
- 1 人：executor。
- 2 人：planner/reviewer + executor。
- 3 人：planner + executor + reviewer。
- 聚焦、最大化、重启、暂停输入、终止进程和人工接管属于后续真实终端能力，不放入当前原型右上角。

### 4.4 右侧状态面板

- 团队配置：选择 1/2/3 人团队和每个角色的 CLI，创建窗口后自动折叠。
- Todo List：从当前对话、团队状态和 Bridge 事件自动推断，不手动新增。
- Bridge 收件箱：显示结构化事件、ACK、等待审查和证据状态。
- Diff、测试、审查、审计日志仍是后续运行时能力，必须通过结构化事件与证据记录进入 UI。

### 4.5 平台差异

| 能力 | macOS 版 | Windows 版 |
|---|---|---|
| 终端托管 | POSIX PTY | ConPTY |
| Bridge 传输 | Unix Domain Socket | Named Pipe |
| 默认 shell | 用户默认 shell，通常为 zsh | PowerShell，允许配置 cmd、Git Bash 或 WSL |
| 文件管理器 | Finder | Explorer |
| 托盘 | Menu Bar / Dock 行为 | System Tray |
| 打包 | DMG/ZIP | NSIS 安装包/ZIP |

远程控制属于后续可选能力。若开启，桌面端默认仍只监听本机；局域网访问必须由用户显式打开并
配置访问密码。远程端只控制本机 Agent Host，不把 CLI Agent 迁移到移动端执行。

Windows 版不默认要求 WSL。若某个 CLI 只能在 WSL 中稳定运行，Adapter 必须把 WSL 作为显式配置
和诊断路径，而不是静默替用户切换执行环境。

## 5. 角色模型与约束

CLI 类型和角色是两个维度。任意已配置 CLI 均可分配以下角色：

| 角色 | 数量 | 默认权限 | 职责 |
|---|---:|---|---|
| Planner | 1 | 读、发任务、运行验证命令 | 分析、拆解、派发、最终验收 |
| Executor | 1 | 工作区读写、运行命令 | 实现、测试、报告 |
| Reviewer | 0..1 | 只读、运行只读检查 | 独立审查、风险分析 |
| Observer | 后续 | 只读 | 人工终端或辅助分析，不参与状态机 |

首版在共享工作树中强制一个 Executor。未来启用 Git worktree 隔离后，才允许多个 Executor
并发，并要求每个执行任务绑定独立 worktree 和分支。

MVP 每个工作区只允许一个活跃会话，当前 UI 每个会话最多三个 Agent。工作区切换后会话在后台继续，
全局默认最多三个活跃工作区；达到上限后必须暂停或结束一个会话才能启动新的会话。

角色切换规则：

- Planner 唯一；替换 Planner 需要明确交接并生成上下文摘要。
- Executor 有活动任务时不可直接替换，必须暂停、取消或完成交接。
- Reviewer 不获得应用层自动写入能力；用户仍可在终端人工操作，但会产生醒目审计事件。
- Planner 默认承担最终批准责任，Reviewer 只能建议 `APPROVE` 或 `CHANGES_REQUIRED`。

## 6. 工作流状态机

### 6.1 会话状态

```text
DRAFT -> READY -> RUNNING <-> PAUSED -> COMPLETED
                     |          |
                     +-------> FAILED / CANCELLED
```

### 6.2 任务状态

```text
BACKLOG -> ASSIGNED -> ACKNOWLEDGED -> IN_PROGRESS -> REVIEW_PENDING
   ^                                                  |
   |                   CHANGES_REQUESTED <------------+
   |                                                  |
   +------------------------- BLOCKED             APPROVED
```

状态只由合法事件推进。例如终端中出现“done”不能完成任务，必须收到合法的
`task.completed` 事件，且包含变更与测试报告。`APPROVED` 前还必须通过应用侧验收门禁。

### 6.3 验收门禁

- 任务范围内的变更摘要存在。
- 要求的测试均有命令和退出码，或记录无法运行的明确原因。
- 严重度为 blocker/high 的审查问题已关闭。
- Planner 已查看任务 diff；该动作记录为审计事件。
- 工作树没有由未知进程产生且未归属任务的变更，或用户明确接受。

## 7. Agent 通信协议

### 7.1 核心原则

- 不通过解析 ANSI 终端屏幕判断业务状态。
- 每条消息有 ID、类型、发送方、接收方、任务 ID 和确认状态。
- 大内容写入会话文件目录，事件只保存引用和摘要。
- 事件追加写入，关键状态可由事件重放恢复。
- 延续原 skill 的 read-before-send 规则，但读取对象升级为收件箱游标。

### 7.2 事件示例

```json
{
  "version": 1,
  "eventId": "evt_01...",
  "sessionId": "ses_01...",
  "taskId": "task_001",
  "type": "task.assigned",
  "fromAgentId": "agent_planner",
  "toAgentId": "agent_executor",
  "createdAt": "2026-06-20T10:00:00.000Z",
  "payload": {
    "objective": "实现登录限流",
    "scope": ["src/auth/**", "tests/auth/**"],
    "acceptance": ["限流测试通过", "不改变既有登录响应结构"]
  }
}
```

首版事件类型：

- `session.started|paused|resumed|completed|failed`
- `task.created|assigned|acknowledged|started|blocked|completed`
- `review.requested|reported|finding.resolved`
- `approval.granted|changes_requested`
- `agent.started|ready|waiting_input|stopped|crashed`
- `evidence.diff_captured|test_recorded|log_attached`
- `human.takeover_started|takeover_ended|override_granted`

### 7.3 Desktop Bridge

MVP 以 Desktop Bridge 作为所有 CLI 的统一控制通道，避免依赖不同 CLI 的实验性服务协议，
也不修改用户的全局 MCP 配置。它继承 smux/tmux bridge 的“先读再发”和跨 Agent 通信语义，
但以结构化事件作为事实来源。应用随包提供 `agent-team-bridge` 小型命令行程序，并向每个
PTY 注入：

```text
AGENT_TEAM_SOCKET=<local socket>
AGENT_TEAM_SESSION_ID=<session id>
AGENT_TEAM_AGENT_ID=<agent id>
AGENT_TEAM_ROLE=<planner|executor|reviewer|observer>
```

Agent 通过明确命令读写事件，例如：

```bash
agent-team-bridge inbox --after <cursor>
agent-team-bridge send --to executor --type task.assigned --file event.json
agent-team-bridge ack <event-id>
agent-team-bridge task complete --task task_001 --report report.json
```

Bridge 在 macOS 使用本机 Unix Domain Socket，在 Windows 使用 Named Pipe。每次连接校验会话
令牌和 Agent 身份，不监听公网端口。为兼容原工作流，可另提供与 `tmux-bridge` 或用户口中的
`smux-bridge` 相似的 `read/message/keys` 命令别名，但核心状态一律使用结构化事件。

在 Adapter 能通过单次启动参数注入会话级 MCP 且不污染用户配置时，后续可把相同能力暴露为
MCP tools；MCP 只是 Bridge 的另一种传输入口，不改变事件协议和权限模型。

### 7.4 消息投递

1. Orchestrator 将事件写入数据库。
2. 目标 Agent 的 Bridge 收件箱收到通知。
3. 对于交互式 CLI，Orchestrator 向 PTY 写入一条短提示，要求 Agent 调用 Bridge 读取详情。
4. Agent 读取后更新游标并 ACK。
5. 超时未 ACK 只显示提醒，不自动重复向终端灌入长文本。

这样可以避免输入重复、终端忙碌时插入文本以及大段内容被 shell 转义破坏。

## 8. CLI Adapter

每种 CLI 使用声明式 Adapter，而不是散落条件判断：

```ts
interface CliAdapter {
  id: string;
  detect(): Promise<DetectionResult>;
  buildLaunchSpec(context: LaunchContext): Promise<LaunchSpec>;
  buildRolePrompt(role: Role, context: PromptContext): Promise<string>;
  capabilities: {
    appendSystemPrompt: boolean;
    initialPrompt: boolean;
    resumeSession: boolean;
    structuredOutput: boolean;
  };
}
```

内置 Adapter：Claude Code、Codex、MiMo Code、OpenCode、Generic CLI。Generic CLI 由用户配置
可执行文件、参数模板、环境变量和提示词注入方式。应用启动时检测命令路径和版本；不负责
安装、升级、认证或保存 CLI 密钥。

Adapter 参数必须以数组传给进程 API，不拼接 shell 字符串。不同版本的命令参数由 Adapter
兼容层管理，检测失败时给出诊断，不擅自添加 `--trust`、跳过权限等危险参数。

## 9. 技术架构

### 9.1 技术选型

首版建议：Electron + React + TypeScript + xterm.js + node-pty + SQLite。

选择 Electron 而非首版直接使用 Tauri 的主要原因是本产品以多 PTY、Node CLI 探测和进程
控制为核心；`node-pty` 已明确支持 macOS 和 Windows，并被 VS Code 等终端产品使用。
Electron 主进程可托管 Node 原生模块，前端使用 xterm.js。代价是安装包和内存更大，但能
显著降低双桌面版本的 PTY、打包和跨平台调试风险。待协议和交互稳定后再评估 Tauri/Rust Host。

参考：

- Electron 进程模型：https://www.electronjs.org/docs/latest/tutorial/process-model
- Electron 安全建议：https://www.electronjs.org/docs/latest/tutorial/security
- node-pty：https://github.com/microsoft/node-pty
- xterm.js：https://xtermjs.org/docs/
- Tauri sidecar 能力：https://v2.tauri.app/develop/sidecar/

### 9.2 进程边界

```text
Renderer (React, sandboxed)
  | typed IPC only
Preload (narrow contextBridge API)
  |
Main Process
  |- WorkspaceService
  |- SessionService
  |- SecurityPolicy
  |- SQLite repository
  |
Utility Process: Agent Host
  |- PTY Manager (node-pty)
  |- Orchestrator / state machine
  |- Bridge socket server
  |- CLI adapters
  `- Evidence collector
       |- git status/diff
       `- test process records
```

Agent Host 放在独立 Utility Process，避免 PTY 或原生模块异常拖垮 UI。Renderer 不接触
Node、文件系统或任意进程启动 API，只能调用经过 schema 校验的 preload 方法。

### 9.3 建议代码结构

```text
agent-team-desktop/
  apps/desktop/
    src/main/           # Electron main 与 IPC
    src/preload/        # 最小权限 bridge
    src/renderer/       # React UI
  packages/
    protocol/           # 事件 schema、状态机类型
    orchestrator/       # 任务编排与验收门禁
    agent-host/         # PTY、socket、进程生命周期
    cli-adapters/       # 内置与 Generic adapters
    persistence/        # SQLite repository 与 migrations
    ui/                 # 通用 UI 组件
  resources/prompts/    # 角色提示词模板
  docs/
  tests/
```

### 9.4 数据模型

- `Workspace`: 路径、名称、最后打开时间、项目检测结果。
- `Session`: 工作区、状态、初始目标、开始/结束时间。
- `AgentProfile`: CLI 类型、命令、参数模板、显示配置，不含密钥。
- `AgentInstance`: 会话、Profile、角色、PTY 状态、收件箱游标。
- `Task`: 父任务、目标、范围、验收标准、负责人、状态。
- `Event`: 不可变事件信封、payload、投递和 ACK 状态。
- `Evidence`: diff/test/log/review 类型、文件引用、摘要和哈希。
- `AuditEntry`: 人工接管、权限变化、终止、角色切换等操作。

数据库放在应用数据目录；大日志按会话分文件并设置滚动上限。工作区中只在用户开启时写入
`.agent-team/`，默认不污染项目目录。

## 10. 生命周期与恢复

- 关闭窗口默认最小化到菜单栏/系统托盘，Agent Host 和任务继续运行。
- 真正退出应用时，如果存在活跃任务，必须选择取消退出或终止所有 Agent 后退出。
- MVP 不承诺操作系统重启后恢复原 PTY；会恢复任务、消息、证据和终端日志，并把中断任务
  标记为 `BLOCKED`，由用户选择重新启动 Agent 后继续。
- 后续版本可增加独立后台 daemon，实现 UI 与运行时完全解耦。

## 11. 安全边界

- `nodeIntegration: false`、`contextIsolation: true`、renderer sandbox 开启。
- 只加载打包后的本地 UI；设置严格 CSP，阻止任意导航和新窗口。
- IPC 使用逐方法白名单和运行时 schema 校验，不暴露通用 `send` 或 shell API。
- 规范化工作区路径，拒绝通过相对路径或符号链接越权访问未授权目录。
- CLI 继承当前用户权限；应用明确提示这不是系统级沙箱。
- 权限确认保留在原 CLI 终端中，应用不得自动点击或发送批准按键。
- 危险命令、生产环境操作、密钥访问和 Git 破坏性操作仍需人工确认。
- 审计日志对角色变化、人工接管、强制终止和门禁覆盖留痕。

## 12. MVP 范围

### 包含

- macOS 桌面应用。
- Windows 桌面应用。
- 文件夹工作区导入和最近列表。
- Codex、Claude Code、MiMo Code、OpenCode、Generic CLI Adapter。
- 1 个 Planner、1 个 Executor、0-1 个 Reviewer。
- 1/2/3 Agent 终端布局，observer、4 窗口、人工接管和完整进程控制后移。
- 结构化任务、消息、ACK、审查与批准状态机。
- Git 状态/diff 证据、测试命令退出码记录。
- 本地 SQLite 持久化与会话日志。
- CLI 检测、版本显示和启动诊断。
- 每个工作区一个活跃会话、全局默认三个后台活跃工作区。
- 内部开发预览包和本机安装验证。

### 不包含

- 多 Executor 同工作树并发。
- 自动安装或登录任何 AI CLI。
- 云同步、远程执行、团队账号和移动端。
- 完整代码编辑器、Git 提交/推送/PR 自动化。
- 自动绕过权限提示。
- 操作系统重启后无缝恢复 PTY。
- 面向公众的签名公证、自动更新、遥测和兼容性支持体系。

## 13. 成功指标

- 新用户在 macOS 或 Windows 上 3 分钟内导入项目并启动两 Agent 会话。
- 所有任务状态变化均能追溯到结构化事件。
- 不通过读取 ANSI 屏幕文本完成任何关键状态判断。
- 进程异常退出后 UI 在 2 秒内反映并保留终端日志。
- 100% 的批准任务包含 diff 查看记录和测试证据或豁免原因。
- 同一共享工作树不会出现两个应用托管的写入型 Executor。

## 14. 已选默认决策

- 产品目录与内部项目名：`agent-team-desktop`。
- UI 名称暂用 Agent Team Desktop，品牌名后续再定。
- macOS 版和 Windows 版作为两个桌面交付目标，共用核心协议和 UI。
- Electron 作为 MVP 宿主，后续以真实数据决定是否迁移。
- SQLite 事件存储，终端日志分文件存储。
- 应用事件总线取代终端文本作为事实来源。
- Planner 最终验收；Reviewer 不直接批准任务。
- 共享工作树严格单 Executor；并发执行推迟到 worktree 方案。
- 真实终端负责展示和人工接管，Desktop Bridge 负责结构化控制。
- 自动执行任务流转，但首次启动、验证命令、危险操作和会话最终结束需要人工确认。
- 关闭窗口后托盘继续运行；每工作区一个活跃会话，全局默认上限为三个。
- 首版面向内部开发预览，不把签名公证和自动更新作为发布门禁。
