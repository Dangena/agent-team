# Development Start

## 当前状态

工程已进入 Phase 1。当前是可运行的 Electron 开发壳，但还不是可发布安装包：

- `apps/desktop/prototype/index.html`：已确认的静态 UI 原型，可直接用浏览器打开。
- `apps/desktop/src/renderer`：同步当前 UI 基线并已接入 Electron 构建的 React Renderer。
- `packages/agent-team-core`：角色、任务、状态流转、验收门禁和角色提示词。
- `packages/protocol`：Bridge request/response 和事件信封类型。
- `packages/platform`：macOS/Windows 平台能力抽象。
- `packages/agent-host`：内存版 Bridge runtime 雏形。
- `packages/cli-adapters`：CLI Adapter 契约和 Generic Adapter。
- `packages/test-fixtures`：Fake Agent CLI。
- `resources/bin/agent-team-bridge.mjs`：Bridge CLI 雏形。

## 本地运行

依赖已通过 pnpm workspace 安装，使用以下命令开发和验证：

```bash
pnpm install
pnpm dev
pnpm build
pnpm check
```

可视化原型是纯静态文件，不需要服务器：

```text
apps/desktop/prototype/index.html
```

依赖路线和后续原生模块记录在 `docs/future-dependencies.md`。

## 当前交接文档

- `docs/development-progress.md`：当前做到了哪里、什么能运行、什么还没做。
- `docs/implementation-handoff.md`：后续开发顺序、模块边界和验收检查。
- `docs/ui-prototype-notes.md`：当前 UI 基线和交互闭环。

## 下一步开发顺序

1. 将 Bridge CLI 的 JSON store 测试逻辑与 `packages/agent-host` 的内存 runtime 收敛。
2. 把 fake flow 的事件输出接入 Renderer mock 数据，让自动 Todo 和 Bridge 收件箱吃真实事件。
3. 实现 CLI Adapter 检测契约，但先不自动启动真实 CLI。
4. 增加 evidence fixtures，并让 approval fixture 引用真实 evidence id。
5. 抽象 macOS PTY/Unix Socket 与 Windows ConPTY/Named Pipe 接口。
6. 接入 xterm.js、node-pty 和 SQLite，并补跨平台验证。
