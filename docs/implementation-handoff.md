# Implementation Handoff

这份文档面向后续接手开发的人，说明当前工程如何继续推进。

## 一句话目标

把 `agent-team/` skill 的多 Agent 协作模式做成 macOS 与 Windows 桌面软件：用户在左侧管理项目
和对话，在中间运行多个 CLI Agent 窗口，在右侧配置团队、查看自动 Todo 和 Bridge 收件箱。

## 当前事实来源

| 内容 | 文件 |
| --- | --- |
| 当前视觉和交互基线 | `apps/desktop/prototype/index.html` |
| 未来 React Renderer 基线 | `apps/desktop/src/renderer/App.tsx` |
| Renderer 样式基线 | `apps/desktop/src/renderer/styles.css` |
| 产品与架构设计 | `docs/product-and-architecture.md` |
| 当前进度快照 | `docs/development-progress.md` |
| 依赖安装清单 | `docs/future-dependencies.md` |
| OpenCodex 可借鉴点 | `docs/opencodex-research.md` |
| Agent Team skill | `agent-team/SKILL.md` |

## UI 开发边界

当前 UI 已确定：

- 左侧 rail 是项目与对话入口。
- 顶部 session bar 必须保持紧凑。
- 中央画布只承载 Agent 终端窗口。
- 右侧配置区创建窗口后自动折叠。
- Todo List 是自动识别的状态流，不提供手动新增入口。
- Bridge 收件箱是结构化消息列表。
- 暂不在右上角提供暂停、接管、新增 Agent 这些按钮。

后续接入真实运行时时，不要把 UI 改回营销页、说明页或大面积卡片布局。当前风格是紧凑的
developer tool 工作台。

## 建议模块切分

### Renderer

当前 `App.tsx` 先把所有状态放在一个文件里，是为了零安装阶段便于审阅。安装依赖后应拆成：

```text
apps/desktop/src/renderer/
  app/App.tsx
  app/state.ts
  components/
    AppIcons.tsx
    LeftRail.tsx
    ProjectList.tsx
    SessionBar.tsx
    AgentCanvas.tsx
    AgentWindow.tsx
    TeamConfigPanel.tsx
    AutoTodoList.tsx
    BridgeInbox.tsx
  styles.css
```

拆分时保持行为一致，不做视觉重设计。

### Main / Preload

Main 负责：

- 应用生命周期。
- 窗口创建与托盘行为。
- IPC sender 校验。
- 工作区路径授权。
- Agent Host utility process 管理。

Preload 只暴露逐方法 API，例如：

```ts
window.agentTeam.selectWorkspace()
window.agentTeam.listCliAdapters()
window.agentTeam.createSession(input)
window.agentTeam.createAgentWindow(input)
window.agentTeam.subscribeBridgeEvents(sessionId)
```

不要暴露通用 `ipcRenderer.send`、任意 shell、任意文件系统 API。

### Agent Host

Agent Host 负责：

- 启动和停止 CLI 进程。
- 后续接入 PTY。
- 注入 Bridge 环境变量。
- 接收 Bridge 请求。
- 维护 agent 状态。
- 将结构化事件写入持久层。

当前 Main 已通过 `createAgentProcessManager()` 启动 Fake CLI，Renderer 可订阅 stdout/stderr 与
状态并单独停止进程。下一步应把该生命周期接口迁移到 Utility Process，并在内部替换为 PTY；
不要让 Renderer 获得任意 executable、args 或 shell 权限。

当前 `packages/agent-host/src/index.ts` 只有内存 runtime；下一步先让 `agent-team-bridge.mjs`
通过本地进程内接口或临时 JSON 文件与它交互，再替换为 Unix Socket/Named Pipe。

### Protocol

`packages/protocol` 应继续补齐 payload 类型：

- `SessionStartedPayload`
- `TaskAssignedPayload`
- `TaskAcknowledgedPayload`
- `TaskCompletedPayload`
- `ReviewRequestedPayload`
- `ReviewReportedPayload`
- `ApprovalGrantedPayload`
- `EvidenceDiffCapturedPayload`
- `HumanTakeoverPayload`

协议层不依赖 Electron、React、PTY 或数据库。

### CLI Adapters

每个 Adapter 至少提供：

- `detect()`：是否可用、可执行文件路径、版本、缺失原因。
- `buildLaunchSpec()`：cwd、env、args。
- `displayName`：UI 展示名。
- `capabilities`：是否支持交互式终端、模型参数、resume、只读模式等。

首批 Adapter：

- `codex`
- `claudecode`
- `opencode`
- `mimocode`
- `zcode`
- `generic`

检测实现可参考 `docs/opencodex-research.md` 中总结的路径发现和诊断思路：优先用户配置，其次
`PATH`，再扫描平台常见位置，并把版本、来源和缺失原因返回给 UI。不要复制 OpenCodex 代码。

### Remote Gateway

远程控制不是当前 MVP，但应预留独立边界。未来实现时：

- 默认关闭，只监听本机。
- 局域网模式必须要求密码。
- 认证、WebSocket、文件预览 token、日志脱敏由独立 gateway 负责。
- gateway 只代理会话状态、Bridge 事件、终端流和有限控制命令。
- gateway 不直接绕过 Main/Agent Host 的权限检查。

## 推荐开发顺序

### Step 1：协议先行

先把 `packages/protocol` 的事件 payload 补完整，并为每个事件给出最小示例。不要先接真实终端。

完成标准：

- 事件类型可覆盖规划、执行、审查、批准、证据、人工接管。
- request/response 有 request id、token、agent id、role、command。
- 幂等和 ACK 语义写入类型或注释。

当前状态：主要 payload、inbox/ack 类型和 envelope 构造器已补入 `packages/protocol/src/index.ts`。
`packages/protocol/src/fixtures.ts` 已提供 task assigned/completed、review reported、approval
granted 示例。后续还应补 evidence fixtures。

### Step 2：Bridge 内存闭环

让 `agent-team-bridge.mjs` 能和 `createInMemoryBridgeRuntime()` 共享一套请求处理逻辑。

完成标准：

- `inbox` 返回事件列表。
- `ack EVENT_ID` 返回确认结果。
- 重复 request id 返回同一个响应。
- token 错误返回结构化错误。

当前状态：Agent Host 内存 runtime 已支持 `inbox`、`ack` 和幂等响应缓存；
`agent-team-bridge.mjs` 已支持 JSON store 模式，可在零安装环境测试 `send -> inbox -> ack`。
当前已抽出 `BridgeEventStore`，并把 JSON store 文件读写收敛到
`resources/lib/bridge-json-store.mjs`。下一步应让 JSON store helper 与 `BridgeEventStore`
接口完全对齐，再替换为 SQLite store。

### Step 3：Fake CLI 端到端

用 Fake CLI 模拟 Planner、Executor、Reviewer 的事件流。

完成标准：

- Planner 创建任务。
- Executor ACK 并 complete。
- Reviewer report。
- Planner approve 或 request changes。
- smoke test 覆盖这条链路。

当前状态：已新增 `scripts/fake-agent-flow.mjs`，并纳入 `scripts/smoke-test.mjs`。它通过
`agent-team-bridge.mjs` 的 JSON store 模式跑通 task assigned、executor complete、review
requested/reported、approval granted。Executor 和 Reviewer 步骤已由
`packages/test-fixtures/bin/fake-agent-cli.mjs --act-once` 进程参与。

下一步应把 fake flow 的事件输出接入 Renderer mock 数据，或将 JSON store handler 收敛进
Agent Host runtime。

### Step 4：CLI 检测

实现 Adapter 检测，但不要自动启动真实 CLI。

完成标准：

- 能检测可执行文件是否存在。
- 能返回版本或缺失原因。
- Renderer 能显示“已识别 CLI”来源于检测结果，而不是硬编码。

当前状态：`packages/cli-adapters/src/index.ts` 已扩展为零依赖检测契约，包含
`detectBuiltInAdapter()`、`detectAllBuiltInAdapters()`、`createBuiltInAdapter()`，并覆盖
`codex`、`claudecode`、`opencode`、`mimocode`、`zcode`。下一步是通过 Main/Preload 把检测结果
提供给 Renderer。

Renderer 和静态 HTML 原型当前已经接入 CLI 检测 mock 状态：右侧配置面板会显示“可用/未配置”，
角色下拉框会显示诊断提示，Agent 窗口会把未配置 CLI 标为 `needs path`。接真实运行时时，
只替换数据来源，不改交互结构。

Todo List 和 Bridge 收件箱当前也已经由同一组 fake Bridge events 推导。后续接入真实运行时或
`scripts/fake-agent-flow.mjs` 输出时，应保持事件驱动方式，不再写静态 Todo 或静态 Inbox 文案。
`@agent-team/protocol` 与 `resources/lib/bridge-ui-events.mjs` 已提供原始 Bridge 事件 + ACK 到 UI
摘要事件的转换 helper；Renderer 草稿目前调用的是协议层 `toBridgeUiEvents()`。

### Step 5：进入真实桌面壳

当前已完成 Electron/Vite、xterm.js、node-pty/ConPTY、SQLite、Socket/Pipe Bridge、真实 CLI
启动入口和双平台打包。后续工作属于签名发布、Windows 真机冒烟或 P2 增强。

## 验收检查清单

每次交接前至少运行：

```bash
pnpm typecheck
pnpm build
pnpm check
pnpm flow
pnpm gate
pnpm stress
```

构建和类型检查应无错误；smoke 应输出 `smoke test passed`；flow 应输出 `ok: true`、
`eventCount: 7`、`ackCount: 6`；gate 与 stress 应输出 `ok: true`。

## 当前风险

- React Renderer 已通过真实编译与 Electron 窗口验证；HTML 原型只作为快照参考。
- 未来远程模式涉及网络暴露，必须先完成认证、文件访问 allowlist 和日志脱敏测试。
- Windows 包已交叉构建，ConPTY 与 Named Pipe 仍需 Windows 真机验证。
- 真实 CLI 的权限提示和登录状态必须由用户手动控制，不能自动绕过。
