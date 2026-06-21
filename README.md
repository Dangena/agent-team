# Agent Team Desktop

Agent Team Desktop 是基于 `agent-team/` skill 的独立桌面端项目。它不会把原有 tmux
实现硬塞进桌面端，而是复用 Agent Team 的角色分工、Bridge 通信、安全边界和验收闭环，
将固定的三 Agent 工作流扩展为可视化、可配置的多 CLI Agent 工作区。

## 当前阶段

当前已完成可运行的内部预览版：Electron + React、xterm.js + node-pty/ConPTY、SQLite、
Unix Socket/Named Pipe Bridge、真实 CLI 检测/启动入口，以及 macOS/Windows 打包配置。

```bash
pnpm dev       # 开发模式
pnpm test      # 单元、smoke、Fake flow 与 100 消息压力门禁
pnpm build     # 构建 Main、Preload、Renderer
pnpm --filter @agent-team/desktop dist:mac
pnpm --filter @agent-team/desktop dist:win
```

本机构建产物位于 `apps/desktop/release/`。

- [产品与技术设计](docs/product-and-architecture.md)
- [实施路线图](docs/delivery-plan.md)
- [详细开发方案](docs/detailed-development-plan.md)
- [MVP Backlog](docs/mvp-backlog.md)
- [开发启动说明](docs/development-start.md)
- [当前开发进度](docs/development-progress.md)
- [后续开发交接指南](docs/implementation-handoff.md)
- [UI 原型说明](docs/ui-prototype-notes.md)
- [OpenCodex 调研记录](docs/opencodex-research.md)

## 已确定原则

- Local-first：项目文件、终端进程、会话记录默认只存在本机。
- 保留 `agent-team/` skill 和 CLI 工作流，桌面端作为独立产品演进。
- 产品交付两个桌面版本：macOS 版和 Windows 版；Android 暂不纳入当前范围。
- CLI 与角色解耦：Codex、Claude Code、MiMo Code、OpenCode 或自定义 CLI 均可承担角色。
- 左侧管理项目工作区和对话，中间显示 Agent 终端窗口，右侧配置 1/2/3 人团队并展示自动 Todo 与 Bridge 收件箱。
- 同一工作树同一时刻只允许一个写入型执行方。
- smux/tmux bridge 语义用于兼容现有 skill；桌面端核心通信使用结构化 Desktop Bridge。
- 终端输出用于展示，结构化事件总线才是 Agent 通信和状态判断的事实来源。
- 不绕过任何 CLI 的权限确认，不保存模型账号密钥。
- 使用 pnpm workspace 与锁文件管理依赖，新增原生依赖前评估跨平台构建影响。
- 远程控制只作为后续可选能力；默认本机优先，局域网访问必须有认证与明确开关。
