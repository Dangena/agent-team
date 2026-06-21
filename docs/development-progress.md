# Development Progress

更新时间：2026-06-21  
当前阶段：内部预览 MVP 已完成

## 总体状态

项目已具备可运行、可测试、可打包的 macOS/Windows 内部预览实现。

已完成：

- 保留并整理 `agent-team/` 为桌面端核心工作流来源。
- 明确首版只做 macOS 与 Windows，不做 Android。
- 建立零安装 workspace 骨架。
- 建立静态 HTML 原型，作为当前视觉与交互基线。
- 将确认后的 UI 基线同步到 React 草稿代码。
- 建立 Agent Team Core、Protocol、Platform、Agent Host、CLI Adapter、Fake CLI 的初始包。
- 建立 `agent-team-bridge.mjs` 的 CLI 雏形。
- 补全协议层主要事件 payload 类型、inbox/ack payload 与事件 envelope 构造器。
- Agent Host 内存 runtime 已支持 `inbox`、`ack`、token 校验、幂等响应缓存和事件列表。
- `agent-team-bridge.mjs` 已支持零安装 JSON store 模式，可本地模拟 `send -> inbox -> ack`。
- Agent Host 已抽出 `BridgeEventStore`，JSON store 读写也收敛到 `resources/lib/bridge-json-store.mjs`。
- 新增 `resources/lib/bridge-ui-events.mjs`，可把 Bridge 原始事件和 ACK 转换成 Renderer 收件箱摘要。
- 新增 `resources/lib/approval-gate.mjs` 与 `scripts/approval-gate-smoke.mjs`，零依赖验证验收门禁规则。
- 新增 `scripts/fake-agent-flow.mjs`，并让 Fake CLI 进程参与 executor/reviewer 步骤，跑通 planner -> executor -> reviewer -> approval 的确定性事件链。
- 新增 `packages/protocol/src/fixtures.ts`，提供 task/review/approval 事件示例。
- 调研 `RyensX/opencodex`，将其中可借鉴的远程网关、启动器、安全认证和 CLI 发现模式整理到 `docs/opencodex-research.md`。
- 将 CLI 检测状态接入静态原型和 React 草稿，右侧配置可展示可用/未配置状态、来源和诊断提示。
- 将静态原型和 React 草稿的自动 Todo 与 Bridge 收件箱改为由 fake Bridge events 推导。
- React 草稿已改为通过 `@agent-team/protocol` 的 `toBridgeUiEvents()` 从原始 Bridge event + ACK 生成 UI 状态。
- 完成依赖阶段切换，后续路线记录在 `docs/future-dependencies.md`。
- 已建立 electron-vite 的 Main/Preload/Renderer 构建链路并通过生产构建。
- Main 已创建安全 BrowserWindow，并通过白名单 IPC 提供平台信息和真实 CLI Adapter 检测。
- Preload 已使用 contextBridge 暴露逐方法 API，Renderer 会加载真实 CLI 检测结果。
- Agent Host 已提供受控子进程管理器，支持启动、stdout/stderr、停止和状态事件。
- Main/Preload/Renderer 已跑通 Fake Agent 的启动、输出展示、单独停止与退出回收。
- preload 固定构建为 CommonJS `.cjs`，在 `sandbox: true` 下完成窗口验证。
- xterm.js + node-pty 已接入真实 PTY，支持输入、ANSI 输出、resize、停止和退出回收。
- 工作区通过系统目录选择器授权，SQLite WAL 保存工作区、会话、事件、证据和审计结构。
- Desktop Bridge 已实现 Unix Socket/Named Pipe、token、角色权限、ACK、幂等和 64 KiB 限制。
- Renderer 支持 Fake 预览和真实 CLI 两种显式启动模式。
- 100 条 Bridge 消息顺序、游标、ACK 幂等门禁已自动化通过。
- 已生成 macOS arm64 `.app/.zip` 与 Windows x64 NSIS `.exe/.zip` 内部预览产物。

未完成：

- 未配置 macOS Developer ID、Windows Authenticode 签名和自动更新；不影响内部预览。
- PTY 当前由 Main 管理，尚未迁移到 Electron Utility Process。
- Windows 包已交叉构建，但仍需 Windows 真机执行 ConPTY/安装器冒烟。
- Remote Gateway、云同步、多 Executor worktree 属于明确的 P2 范围，不计入本次 MVP。

## 当前可运行/可检查内容

### 静态 UI 原型

文件：

```text
apps/desktop/prototype/index.html
```

直接用浏览器打开即可，不需要服务器。

当前原型已确认的产品样式：

- 左侧：项目、项目菜单、项目内对话、新对话、搜索、CLI 管理、设置。
- 中间：Agent 窗口画布，支持 1/2/3 Agent 布局。
- 右侧：可折叠 Agent 团队配置、自动 Todo List、Bridge 收件箱。
- Agent 团队数量：
  - 1：执行
  - 2：规划、审查 + 执行
  - 3：规划 + 执行 + 审查
- Todo List 不手动新增，按当前对话与团队状态自动推断。

### React 草稿

文件：

```text
apps/desktop/src/renderer/App.tsx
apps/desktop/src/renderer/styles.css
```

当前 React 草稿已同步静态原型的结构、视觉和本地状态流，作为以后接真实运行时的 UI 代码基线。
当前可通过 `pnpm dev` 在 Electron 中运行，并通过 `pnpm build` 生成开发构建产物。

### 验证脚本

可使用 Codex 桌面内置 Node：

```bash
pnpm dev
pnpm build
pnpm check
```

`smoke-test.mjs` 验证工程结构、Bridge fake flow 与 approval gate。

## 代码进度

| 区域 | 状态 | 说明 |
| --- | --- | --- |
| `agent-team/` skill | 已整理 | 保留 tmux/smux 工作流，作为角色与协作原则来源 |
| 静态 HTML 原型 | 已确认 | 当前 UI/UX 基线，浏览器直接打开 |
| React Renderer | 已运行 | xterm 终端、工作区、真实检测、Fake/真实启动、Todo 与 Inbox |
| Main/Preload | 已运行 | 安全窗口、CSP、sender 校验、逐方法 IPC、目录授权和打包路径 |
| Agent Team Core | 初始类型 | 角色、任务、状态机、验收门禁雏形 |
| Protocol | 已扩展 | Bridge request/response、事件信封、主要事件 payload、inbox/ack 类型 |
| Protocol Fixtures | 已新增 | task assigned/completed、review reported、evidence diff/test、approval granted 示例 |
| Platform | 双平台抽象 | macOS/Windows bridge transport、shell、文件管理器标签 |
| Persistence | SQLite WAL | 工作区、会话、事件、证据、审计表与幂等事件写入 |
| Agent Host | PTY + Bridge | node-pty/ConPTY、Socket/Pipe、token/ACK/幂等、状态与输出事件 |
| CLI Adapters | 检测契约已扩展 | 支持 codex、claudecode、opencode、mimocode、zcode 的 PATH/配置路径/平台常见路径检测结构 |
| Renderer CLI 状态 | 已接入真实检测 | 显示路径、版本、缺失诊断并支持真实启动模式 |
| Renderer Bridge 状态 | runtime + fixtures | 优先读取 runtime，空会话使用确定性 fixtures |
| Fake CLI | 可执行测试 Agent | 可输出 ready，并通过 `--act-once` 消费 inbox、ACK、发送完成/审查事件 |
| Bridge CLI | JSON store 闭环 | `send`、`inbox`、`ack` 通过共享 JSON store helper 串联测试 |
| Bridge UI Events | 已新增 helper | fake flow JSON store 可转换为 UI 收件箱摘要 |
| Fake Flow | 已可运行 | 覆盖 assigned/completed、diff/test evidence、review、approval（7 events / 6 ACK） |
| Approval Gate | 已可运行 | `scripts/approval-gate-smoke.mjs` 验证 diff、测试证据、blocker/high finding 门禁 |
| OpenCodex 调研 | 已记录 | 只吸收远程、安全、诊断和发现思路，不复制 AGPL 实现代码 |

## 关键约束

- 依赖安装已获用户明确同意，使用 pnpm workspace 和 `pnpm-lock.yaml` 管理。
- 当前 workspace 为本项目开发事实来源。
- 桌面端不应依赖解析终端屏幕文本推进任务状态，结构化 Bridge 才是事实来源。
- 不自动绕过 CLI 权限提示，不默认添加 trust、dangerously、never-ask 之类参数。
- 一个共享工作树同一时刻只允许一个写入型 executor。

## 后续版本

1. Windows 真机执行安装、ConPTY、Named Pipe 和真实 CLI 冒烟。
2. 配置双平台代码签名、公证与自动更新。
3. 将 PTY/Bridge Host 迁移到 Utility Process，提高主进程故障隔离。
4. 预览反馈稳定后再进入 Remote Gateway、多 Executor worktree 等 P2 能力。
