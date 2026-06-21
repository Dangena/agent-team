# OpenCodex Research Notes

调研日期：2026-06-21  
来源：[RyensX/opencodex](https://github.com/RyensX/opencodex)  
本地调研提交：`5c411938b02ad8934d2e506548ba5b03c9db71ca`  
许可观察：仓库使用 AGPL-3.0。本项目只借鉴架构思路，不复制实现代码。

## 结论

OpenCodex 更像是 Codex Desktop 的远程访问与浏览器化中间层，而不是多 Agent 编排器。它的
核心价值在于：把本机 Codex Desktop 的 UI/IPC/文件预览能力包装成一个带认证的 HTTP/WebSocket
入口，让手机、平板或另一台电脑通过浏览器访问同一台机器上的 Codex。

Agent Team Desktop 的方向不同：我们要管理多个 CLI Agent、角色、任务、证据和 Bridge 事件。
因此不能照搬 OpenCodex 的“代理官方 Codex Desktop renderer”路线，但可以吸收它在启动器、
远程访问、安全、诊断和运行时发现上的设计。

## 可借鉴点

### 1. 启动器与远程入口

OpenCodex 把“本机模式 / 局域网模式 / 端口 / 密码 / URL 复制 / 日志路径 / 运行目录”集中在
Launcher 中管理。这个模式值得用于 Agent Team Desktop 的未来远程控制端：

- 默认只监听 `127.0.0.1`。
- 用户显式开启“局域网访问”后才监听 LAN 地址。
- UI 显示本机 URL 与局域网 URL，支持复制。
- 远程入口与主桌面窗口分离，避免主应用复杂化。
- 状态页显示运行目录、日志位置、认证状态和最近错误。

首版桌面 MVP 不需要远程控制，但应该预留 `Remote Gateway` 的边界，避免以后把网络服务硬塞进
Renderer。

### 2. 安全模型

OpenCodex 的远程入口坚持“默认本地、可选密码、短期 token、WebSocket 携带 token、文件预览
token 化、日志脱敏”。这些原则应进入我们的远程模式设计：

- 远程功能默认关闭。
- 开启 LAN 访问必须设置访问密码。
- 密码只保存 hash，不保存明文。
- 登录 token 只在运行时内存中保存，支持过期。
- WebSocket 连接必须通过同一套认证门禁。
- 本机文件预览必须使用 allowlist 或短期 token，不能暴露任意绝对路径。
- 日志和诊断不能记录 prompt、完整文件内容、密钥或用户输入全文。

### 3. 网关进程边界

OpenCodex 把 HTTP、WebSocket、静态资源、认证、IPC 路由与官方运行时 hook 拆成清晰模块。
Agent Team Desktop 可以借鉴这个边界，但网关职责应更窄：

- 对外只暴露会话状态、Bridge 事件流、Agent 终端流和有限控制命令。
- 不直接拥有项目写入能力。
- 不解析 Agent 终端文本作为业务状态。
- 不绕过桌面端的权限确认、工作树锁和验收门禁。
- 远程端只作为控制台，真实 Agent 进程仍运行在用户本机 Agent Host。

### 4. CLI 和运行时发现

OpenCodex 对 Codex Desktop 官方安装路径、asar、可执行文件、macOS/Windows/Linux 布局做了比较
稳健的发现和诊断。我们不需要包装官方 Codex Desktop，但 CLI Adapter 可以借鉴它的“多候选路径
+ 明确诊断”方式：

- 支持用户显式配置可执行文件路径。
- 自动扫描常见安装位置和 `PATH`。
- 返回版本、来源、可执行性和缺失原因。
- 把检测结果显示给 UI，而不是硬编码“可用 CLI”。
- Windows 下区分 PowerShell、cmd、Git Bash、WSL 的启动方式。

### 5. 浏览器/远程端 UI

OpenCodex 的 Web Shell 重点不是重做产品 UI，而是提供认证页、设置入口、插件开关和桥接层。
这提醒我们：未来远程端不应该另起一套复杂产品，而应尽量复用 Agent Team Desktop 的会话模型
和 UI 状态，只把输入输出通过网关转发。

## 不应借鉴的部分

- 不把官方 Codex Desktop renderer 当作我们的 UI 容器。
- 不 hook 官方 Codex Desktop 的私有 IPC 作为核心能力。
- 不以单 Codex 会话为产品中心；本项目核心是多 CLI Agent 团队。
- 不复制 OpenCodex 代码。其 AGPL-3.0 许可会给分发和网络服务带来额外义务。
- 不在零安装阶段引入 Electron、`ws`、asar 或任何 OpenCodex 依赖。

## 对本项目的设计调整

### MVP 保持不变

当前 MVP 仍然先做本机 macOS 和 Windows 桌面端：

- 左侧项目与对话。
- 中间 1/2/3 Agent 终端窗口。
- 右侧团队配置、自动 Todo、Bridge 收件箱。
- Fake CLI 和 JSON store Bridge 先跑通结构化协作闭环。

### 新增未来模块：Remote Gateway

后续依赖安装并跑通本机桌面壳后，可增加一个可选模块：

```text
Desktop App
  Renderer <-> Main <-> Agent Host
                         |
                         +-- Remote Gateway (optional)
                               - HTTP auth
                               - WebSocket events
                               - terminal stream proxy
                               - local file preview tokens
                               - sanitized diagnostics
```

Remote Gateway 的第一版只服务同一台机器上的浏览器和局域网浏览器，不做公网穿透。Tailscale、
ZeroTier 或 VPN 可以作为用户自己的网络层，但应用内不内置云转发。

### CLI Adapter 任务增强

`packages/cli-adapters` 后续应补：

- `detectAll()`：扫描 Codex、Claude Code、OpenCode、MiMo Code、Zcode、Generic。
- `source`：`path`、`configured`、`well-known-location`、`missing`。
- `diagnostics`：缺失路径、版本命令失败、权限不可执行、Windows shell 不匹配等。
- `remoteSafe`：是否允许远程端启动/重启该 CLI，默认 false，必须用户确认。

### 安全验收新增项

未来实现远程模式前，必须先完成：

- 认证 token 测试。
- WebSocket 未认证拒绝测试。
- 本机文件预览 allowlist 测试。
- 日志脱敏测试。
- 局域网模式必须有密码的 UI/单元测试。

## 后续行动

1. 继续完成本地 JSON store Bridge 与 Agent Host runtime 的 handler 收敛。
2. 把 Fake CLI 事件流接入 Renderer mock 数据，让 Todo 和 Bridge 收件箱来自真实事件。
3. 实现 CLI Adapter 检测契约时，采用“多路径扫描 + 明确诊断”的模式。
4. 在依赖安装后，把 Remote Gateway 作为独立可选进程规划，不塞进 Renderer。
5. 在公开分发前复查 OpenCodex 许可和所有借鉴来源，确保没有复制 AGPL 代码。
