# Agent Team

固化的本地多 Agent 工作流：Codex 负责规划、分派、审查和验收，Claude Code 负责实现，MiMo Code 仅在需要时加入做独立分析或复核。跨 pane 通信使用 smux 风格的 `tmux-bridge`。

本目录同时是可安装的 Codex skill：`SKILL.md` 描述 Agent Team 协议，`bin/` 提供当前 tmux
实现，`prompts/` 提供各角色提示词。桌面版应复用协议与安全边界，而不是把 tmux 布局当成
内部 API。

## 安装命令

```bash
cd /path/to/agent-team
./install.sh ~/.local/bin
```

安装前也可以直接运行 `./bin/agent-team`。

## 快速使用

在目标项目目录执行：

```bash
agent-team start "实现登录限流并补充测试"
```

默认创建 `agent-<项目目录名>` tmux session，并打开两个 pane：

- `codex`: Lead，只规划和审查
- `claude`: Worker，负责修改代码和测试

按需加入 MiMo：

```bash
agent-team add-mimo
```

向已有会话追加需求：

```bash
agent-team task "继续处理审查发现的问题"
```

其他命令：

```bash
agent-team status
agent-team attach
agent-team stop
```

指定项目或会话名：

```bash
agent-team start --project ~/src/app --session app-team "修复支付回调"
agent-team add-mimo --session app-team
```

需要与日常 tmux 会话隔离时，为所有命令设置同一个 socket 名：

```bash
export AGENT_TEAM_TMUX_SOCKET=agents
agent-team start "实现登录限流"
```

## 安全边界

- 启动器不会使用 `--dangerously-skip-permissions` 或类似参数。
- Claude 是默认唯一代码执行者；MiMo 默认只读复核。
- Codex 必须检查实际 diff 和测试结果，不能仅相信 Worker 的完成声明。
- 权限提示、破坏性操作、密钥和生产环境修改仍需人工确认。
- 当前实现使用同一工作目录，不能让两个 Worker 并发写代码。

MiMo 默认不添加 `--trust`。确实需要沿用旧行为时，可显式设置：

```bash
AGENT_TEAM_MIMO_TRUST=1 agent-team add-mimo
```

## 文件

- `bin/agent-team`: 会话管理入口
- `bin/agent-team-role`: CLI 角色启动器
- `bin/tmux-bridge`: vendored smux bridge
- `prompts/`: 三个 Agent 的固定角色协议
