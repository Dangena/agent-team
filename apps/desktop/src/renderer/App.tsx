import { useEffect, useMemo, useRef, useState } from "react";
import type { BridgeUiEvent } from "@agent-team/protocol";
import type {
  AgentPtyEvent as AgentProcessEvent,
  AgentPtySnapshot as AgentProcessSnapshot
} from "@agent-team/agent-host";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const cliOptions = ["codex", "claudecode", "opencode", "mimocode", "zcode"] as const;

type Cli = (typeof cliOptions)[number];
type CliStatus = "available" | "missing";
type TeamSize = 1 | 2 | 3;
type RoleClass = "plan" | "exec" | "review";
type RoleKey = "planner" | "plannerReviewer" | "executor" | "reviewer";
type TodoState = "done" | "active" | "waiting";
type IconName =
  | "plus"
  | "search"
  | "folder"
  | "edit"
  | "more"
  | "chevron"
  | "terminal"
  | "panel"
  | "inbox";

type RoleSpec = {
  key: RoleKey;
  label: string;
  roleClass: RoleClass;
  defaultCli: Cli;
};

type AgentWindow = RoleSpec & {
  cli: Cli;
};

type CliDetection = {
  id: Cli;
  label: string;
  status: CliStatus;
  source: string;
  version?: string;
  reason?: string;
};

type Chat = {
  id: string;
  title: string;
  time: string;
  teamCreated: boolean;
  windows: AgentWindow[];
};

type Project = {
  id: string;
  name: string;
  branch: string;
  status: string;
  path?: string;
  available?: boolean;
  chats: Chat[];
};

type Assignments = Partial<Record<RoleKey, Cli>>;

const roleSets: Record<TeamSize, RoleSpec[]> = {
  1: [{ key: "executor", label: "执行", roleClass: "exec", defaultCli: "claudecode" }],
  2: [
    { key: "plannerReviewer", label: "规划、审查", roleClass: "plan", defaultCli: "codex" },
    { key: "executor", label: "执行", roleClass: "exec", defaultCli: "claudecode" }
  ],
  3: [
    { key: "planner", label: "规划", roleClass: "plan", defaultCli: "codex" },
    { key: "executor", label: "执行", roleClass: "exec", defaultCli: "claudecode" },
    { key: "reviewer", label: "审查", roleClass: "review", defaultCli: "mimocode" }
  ]
};

const initialProjects: Project[] = [];

const initialAssignments: Assignments = {
  planner: "codex",
  plannerReviewer: "codex",
  executor: "claudecode",
  reviewer: "mimocode"
};

const initialCliDetections: Record<Cli, CliDetection> = {
  codex: { id: "codex", label: "Codex", status: "available", source: "PATH", version: "detected" },
  claudecode: { id: "claudecode", label: "Claude Code", status: "available", source: "PATH", version: "detected" },
  opencode: { id: "opencode", label: "OpenCode", status: "available", source: "PATH", version: "detected" },
  mimocode: { id: "mimocode", label: "MiMo Code", status: "missing", source: "missing", reason: "需要配置路径" },
  zcode: { id: "zcode", label: "Zcode", status: "missing", source: "missing", reason: "需要配置路径" }
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" aria-hidden="true" focusable="false">
      <use href={`#icon-${name}`} />
    </svg>
  );
}

function activeFrom(projects: Project[], projectId: string, chatId: string) {
  const project = projects.find((item) => item.id === projectId) ?? projects[0];
  const chat = project?.chats.find((item) => item.id === chatId) ?? project?.chats[0];
  return { project, chat };
}

function createWindowsFrom(size: TeamSize, assignments: Assignments): AgentWindow[] {
  return roleSets[size].map((role) => ({
    ...role,
    cli: assignments[role.key] ?? role.defaultCli
  }));
}

function cliOptionLabel(cli: Cli, detections: Record<Cli, CliDetection>) {
  const detection = detections[cli];
  return detection.status === "available" ? `${detection.label} · 已识别` : `${detection.label} · 未配置`;
}

function cliFieldDetail(cli: Cli, detections: Record<Cli, CliDetection>) {
  const detection = detections[cli];
  return detection.status === "available"
    ? `${detection.source} · ${detection.version ?? "version pending"}`
    : detection.reason ?? "未检测到可执行文件";
}

function cliStatusLabel(cli: Cli, detections: Record<Cli, CliDetection>) {
  return detections[cli].status === "available" ? "ready" : "needs path";
}

function cliTerminalLine(cli: Cli, detections: Record<Cli, CliDetection>) {
  const detection = detections[cli];
  return detection.status === "available"
    ? `${detection.label} detected from ${detection.source}`
    : `${detection.label} executable not configured`;
}

function terminalRole(role: RoleSpec) {
  return role.key === "plannerReviewer" ? "planner+reviewer" : role.key;
}

function compactHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function agentIdFor(role: RoleSpec, chatId: string) {
  return `preview-${compactHash(chatId)}-${processRole(role)}`;
}

function bridgeAgentIdFor(role: RoleSpec) {
  return `preview-${processRole(role)}`;
}

function processRole(role: RoleSpec): "planner" | "executor" | "reviewer" {
  return role.key === "plannerReviewer" ? "planner" : role.key;
}

function processStatus(status?: AgentProcessSnapshot["status"], active = false) {
  if (status === "running" && active) return { label: "工作中", tone: "running" };
  if (status === "running") return { label: "已就绪", tone: "idle" };
  if (status === "failed") return { label: "启动失败", tone: "warning" };
  if (status === "exited") return { label: "已停止", tone: "idle" };
  return { label: "等待中", tone: "idle" };
}

function hasBridgeEvent(events: BridgeUiEvent[], type: BridgeUiEvent["type"]) {
  return events.some((event) => event.type === type && event.status !== "waiting");
}

function eventMessageClass(event: BridgeUiEvent) {
  if (event.status === "acked") {
    return "ok";
  }
  if (event.status === "queued") {
    return "waiting";
  }
  return "";
}

function eventTitle(event: BridgeUiEvent) {
  return event.to ? `${event.type} -> ${event.to}` : event.type;
}

function AppIcons() {
  return (
    <svg width="0" height="0" className="svg-defs" aria-hidden="true" focusable="false">
      <symbol id="icon-plus" viewBox="0 0 24 24">
        <path d="M12 5v14M5 12h14" />
      </symbol>
      <symbol id="icon-search" viewBox="0 0 24 24">
        <path d="m21 21-4.3-4.3" />
        <circle cx="11" cy="11" r="7" />
      </symbol>
      <symbol id="icon-folder" viewBox="0 0 24 24">
        <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" />
      </symbol>
      <symbol id="icon-edit" viewBox="0 0 24 24">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" />
      </symbol>
      <symbol id="icon-more" viewBox="0 0 24 24">
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </symbol>
      <symbol id="icon-chevron" viewBox="0 0 24 24">
        <path d="m6 9 6 6 6-6" />
      </symbol>
      <symbol id="icon-terminal" viewBox="0 0 24 24">
        <path d="m7 8 4 4-4 4" />
        <path d="M13 17h4" />
        <rect x="3" y="4" width="18" height="16" rx="2" />
      </symbol>
      <symbol id="icon-panel" viewBox="0 0 24 24">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M15 4v16" />
      </symbol>
      <symbol id="icon-inbox" viewBox="0 0 24 24">
        <path d="M4 13h4l2 3h4l2-3h4" />
        <path d="M5 20h14a2 2 0 0 0 2-2v-6L17 4H7l-4 8v6a2 2 0 0 0 2 2Z" />
      </symbol>
    </svg>
  );
}

function TerminalSurface({
  agentId,
  intro,
  output,
  running
}: {
  agentId: string;
  intro: string;
  output: string;
  running: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const outputOffsetRef = useRef(0);
  const runningRef = useRef(running);
  runningRef.current = running;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
      fontSize: 12,
      lineHeight: 1.35,
      scrollback: 5_000,
      theme: {
        background: "#101216",
        foreground: "#e8edf5",
        cursor: "#9db2ff",
        green: "#9dd6b5",
        yellow: "#f2c46d",
        selectionBackground: "rgba(99, 118, 229, 0.3)",
        selectionInactiveBackground: "rgba(99, 118, 229, 0.16)"
      }
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);
    terminal.writeln(intro);
    if (output) terminal.write(output);
    outputOffsetRef.current = output.length;
    terminalRef.current = terminal;

    const fit = () => {
      try {
        fitAddon.fit();
        void window.agentTeam?.resizeTerminal(agentId, terminal.cols, terminal.rows);
      } catch {
        // Layout can briefly report zero dimensions while panes are changing.
      }
    };
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    fit();
    const dataSubscription = terminal.onData((data) => {
      if (runningRef.current) void window.agentTeam?.writeTerminal(agentId, data);
    });

    return () => {
      observer.disconnect();
      dataSubscription.dispose();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [agentId, intro]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    if (output.length < outputOffsetRef.current) {
      terminal.clear();
      outputOffsetRef.current = 0;
    }
    const next = output.slice(outputOffsetRef.current);
    if (next) terminal.write(next);
    outputOffsetRef.current = output.length;
  }, [output]);

  return <div className="terminal xterm-host" ref={hostRef} />;
}

export function App() {
  const [cliDetections, setCliDetections] = useState(initialCliDetections);
  const [teamSize, setTeamSize] = useState<TeamSize>(3);
  const [assignments, setAssignments] = useState<Assignments>(initialAssignments);
  const [configCollapsed, setConfigCollapsed] = useState(false);
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [activeChatId, setActiveChatId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [openMenuProjectId, setOpenMenuProjectId] = useState<string | null>(null);
  const [nextChatNumber, setNextChatNumber] = useState(2);
  const [toast, setToast] = useState("");
  const [agentProcesses, setAgentProcesses] = useState<Record<string, AgentProcessSnapshot>>({});
  const [agentOutput, setAgentOutput] = useState<Record<string, string>>({});
  const [activeAgents, setActiveAgents] = useState<Record<string, boolean>>({});
  const activityTimersRef = useRef<Record<string, number>>({});
  const [runtimeBridgeEvents, setRuntimeBridgeEvents] = useState<BridgeUiEvent[]>([]);
  const { project: activeProject, chat: activeChat } = activeFrom(projects, activeProjectId, activeChatId);
  const roles = roleSets[teamSize];
  const activeWindows = activeChat?.windows ?? [];

  useEffect(() => {
    void window.agentTeam?.listCliAdapters().then((detections) => {
      setCliDetections((current) => {
        const next = { ...current };
        for (const detection of detections) {
          if (!(detection.id in next)) continue;
          const id = detection.id as Cli;
          next[id] = {
            id,
            label: detection.displayName,
            status: detection.available ? "available" : "missing",
            source: detection.source,
            ...(detection.version ? { version: detection.version } : {}),
            ...(detection.reason ? { reason: detection.reason } : {})
          };
        }
        return next;
      });
    });
  }, []);

  useEffect(() => {
    const api = window.agentTeam;
    if (!api || !activeChat?.teamCreated) return;
    const refresh = () => {
      void api.listBridgeUiEvents("ses_desktop_preview").then(setRuntimeBridgeEvents);
    };
    refresh();
    const timer = window.setInterval(refresh, 1_000);
    return () => window.clearInterval(timer);
  }, [activeChat?.teamCreated]);

  useEffect(() => {
    void window.agentTeam?.listWorkspaces().then((workspaces) => {
      if (!workspaces.length) return;
      const restored = workspaces.map((workspace, index): Project => ({
        id: workspace.id,
        name: workspace.name,
        branch: workspace.branch ?? "no git",
        status: workspace.available ? (workspace.dirty ? "dirty" : "clean") : "missing",
        path: workspace.path,
        available: workspace.available,
        chats: [{
          id: `session-${workspace.id}`,
          title: index === 0 ? "恢复的工作区会话" : "工作区会话",
          time: "最近",
          teamCreated: false,
          windows: []
        }]
      }));
      setProjects(restored);
      setActiveProjectId(restored[0]?.id ?? "");
      setActiveChatId(restored[0]?.chats[0]?.id ?? "");
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const api = window.agentTeam;
    if (!api) return;

    void api.listAgentProcesses().then((processes) => {
      setAgentProcesses(Object.fromEntries(processes.map((process) => [process.agentId, process])));
    });
    return api.onAgentProcessEvent((event: AgentProcessEvent) => {
      setAgentProcesses((current) => ({ ...current, [event.agentId]: event }));
      if (event.type === "output" && event.data) {
        setAgentOutput((current) => ({
          ...current,
          [event.agentId]: `${current[event.agentId] ?? ""}${event.data}`.slice(-100_000)
        }));
        setActiveAgents((current) => ({ ...current, [event.agentId]: true }));
        window.clearTimeout(activityTimersRef.current[event.agentId]);
        activityTimersRef.current[event.agentId] = window.setTimeout(() => {
          setActiveAgents((current) => ({ ...current, [event.agentId]: false }));
          delete activityTimersRef.current[event.agentId];
        }, 1_500);
      }
    });
  }, []);

  useEffect(() => () => {
    for (const timer of Object.values(activityTimersRef.current)) window.clearTimeout(timer);
  }, []);

  const configSummary = useMemo(
    () => `${teamSize} 人团队 · ${roles.map((role) => assignments[role.key] ?? role.defaultCli).join(" / ")}`,
    [assignments, roles, teamSize]
  );

  const cliSummary = useMemo(() => {
    const available = cliOptions.filter((cli) => cliDetections[cli].status === "available").length;
    const missing = cliOptions.length - available;
    return `CLI 检测：${available} 可用 · ${missing} 未配置`;
  }, [cliDetections]);

  const bridgeEvents = useMemo(
    () => activeChat?.teamCreated ? runtimeBridgeEvents : [],
    [activeChat?.teamCreated, runtimeBridgeEvents]
  );

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return projects;
    return projects
      .map((project) => {
        const projectMatch = [project.name, project.branch, project.status, project.path ?? ""]
          .some((value) => value.toLowerCase().includes(query));
        const chats = projectMatch
          ? project.chats
          : project.chats.filter((chat) => `${chat.title} ${chat.time}`.toLowerCase().includes(query));
        return chats.length ? { ...project, chats } : null;
      })
      .filter((project): project is Project => Boolean(project));
  }, [projects, searchQuery]);

  const todoItems = useMemo(() => {
    const hasReviewer = roles.some((role) => role.key === "reviewer" || role.key === "plannerReviewer");
    const plannerCli = assignments.planner ?? assignments.plannerReviewer ?? "codex";
    const executorCli = assignments.executor ?? "claudecode";
    const reviewerCli = assignments.reviewer ?? assignments.plannerReviewer ?? "mimocode";
    const teamCreated = Boolean(activeChat?.teamCreated);
    const taskAssigned = hasBridgeEvent(bridgeEvents, "task.assigned");
    const taskCompleted = hasBridgeEvent(bridgeEvents, "task.completed");
    const reviewRequested = hasBridgeEvent(bridgeEvents, "review.requested");
    const reviewReported = hasBridgeEvent(bridgeEvents, "review.reported");
    const approvalGranted = hasBridgeEvent(bridgeEvents, "approval.granted");

    const items: Array<{ state: TodoState; label: string; title: string; detail: string }> = [
      {
        state: activeChat ? "done" : "active",
        label: activeChat ? "done" : "next",
        title: "识别对话目标",
        detail: activeChat ? `${activeChat.title} · 已提取工作区目标` : "等待当前对话"
      },
      {
        state: teamCreated ? "done" : "active",
        label: teamCreated ? "done" : "next",
        title: "生成 Agent 窗口",
        detail: teamCreated ? `${activeWindows.length || teamSize} 个窗口已连接 smux-bridge` : "等待创建当前对话的 Agent 窗口"
      },
      {
        state: taskAssigned ? "done" : teamCreated ? "active" : "waiting",
        label: taskAssigned ? "done" : teamCreated ? "next" : "wait",
        title: "派发执行任务",
        detail: taskAssigned ? `${plannerCli} -> ${executorCli} · task.assigned 已 ACK` : `${plannerCli} 准备任务包`
      },
      {
        state: taskCompleted ? "done" : taskAssigned ? "active" : "waiting",
        label: taskCompleted ? "done" : taskAssigned ? "next" : "wait",
        title: "回收执行结果",
        detail: taskCompleted ? `${executorCli} 已提交 task.completed` : `${executorCli} 等待完成报告`
      }
    ];

    items.push(
      hasReviewer
        ? {
            state: reviewReported ? "done" : reviewRequested || taskCompleted ? "active" : "waiting",
            label: reviewReported ? "done" : reviewRequested || taskCompleted ? "next" : "wait",
            title: "审查 Diff 与证据",
            detail: reviewReported ? `${reviewerCli} 已提交 review.reported` : `${reviewerCli} 等待 review.requested`
          }
        : {
            state: taskCompleted ? "active" : "waiting",
            label: taskCompleted ? "next" : "wait",
            title: "回写执行结果",
            detail: "执行完成后由 Bridge 同步消息与证据"
          }
    );

    items.push({
      state: approvalGranted ? "done" : reviewReported || (!hasReviewer && taskCompleted) ? "active" : "waiting",
      label: approvalGranted ? "done" : reviewReported || (!hasReviewer && taskCompleted) ? "next" : "wait",
      title: "验收并批准",
      detail: approvalGranted ? "approval.granted 已写入 Bridge" : "等待 planner 查看 diff 与证据"
    });

    return items;
  }, [activeChat, assignments, bridgeEvents, roles, teamSize]);

  function announce(message: string) {
    setToast(message);
  }

  function selectProject(project: Project) {
    setActiveProjectId(project.id);
    setActiveChatId(project.chats[0]?.id ?? "");
    setOpenMenuProjectId(null);
  }

  function selectChat(projectId: string, chatId: string) {
    setActiveProjectId(projectId);
    setActiveChatId(chatId);
    setOpenMenuProjectId(null);
  }

  async function addProject() {
    const workspace = await window.agentTeam?.importWorkspace();
    if (!workspace) return;
    const chatId = `session-${workspace.id}`;
    const project: Project = {
      id: workspace.id,
      name: workspace.name,
      branch: workspace.branch ?? "no git",
      status: workspace.dirty ? "dirty" : "clean",
      path: workspace.path,
      available: workspace.available,
      chats: [{
        id: chatId,
        title: "新工作区会话",
        time: "刚刚",
        teamCreated: false,
        windows: []
      }]
    };
    setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
    setActiveProjectId(project.id);
    setActiveChatId(chatId);
    setOpenMenuProjectId(null);
    announce(`已导入 ${project.name}`);
  }

  function addChat(projectId = activeProject?.id) {
    if (!projectId) return;

    const chatNumber = nextChatNumber;
    const chat: Chat = {
      id: `c${chatNumber}`,
      title: `新对话 ${chatNumber}`,
      time: "刚刚",
      teamCreated: false,
      windows: []
    };

    setProjects((current) =>
      current.map((project) =>
        project.id === projectId ? { ...project, chats: [chat, ...project.chats] } : project
      )
    );
    setActiveProjectId(projectId);
    setActiveChatId(chat.id);
    setOpenMenuProjectId(null);
    setNextChatNumber((value) => value + 1);
    announce("新对话已创建");
  }

  function renameProject(projectId: string) {
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId && !project.name.endsWith(" updated")
          ? { ...project, name: `${project.name} updated` }
          : project
      )
    );
    setOpenMenuProjectId(null);
    announce("项目已重命名");
  }

  function removeProject(projectId: string) {
    if (projects.length === 1) {
      setOpenMenuProjectId(null);
      announce("至少保留一个项目");
      return;
    }

    const remaining = projects.filter((project) => project.id !== projectId);
    const nextProject = remaining[0];
    if (!nextProject) return;
    setProjects(remaining);
    setActiveProjectId(nextProject.id);
    setActiveChatId(nextProject.chats[0]?.id ?? "");
    void window.agentTeam?.removeWorkspace(projectId);
    setOpenMenuProjectId(null);
    announce("项目已移除");
  }

  function changeTeamSize(size: TeamSize) {
    setTeamSize(size);
  }

  async function createWindows() {
    if (!activeProject?.path) {
      announce("请先添加项目工作区");
      return;
    }
    if (!activeChat) {
      announce("请先选择一个对话");
      return;
    }
    const nextWindows = createWindowsFrom(teamSize, assignments);
    const api = window.agentTeam;
    if (!api) {
      announce("Desktop API 不可用");
      return;
    }

    const unavailable = nextWindows.filter((agent) => cliDetections[agent.cli].status !== "available");
    if (unavailable.length) {
      announce(`请先配置：${unavailable.map((agent) => cliDetections[agent.cli].label).join("、")}`);
      return;
    }

    const startedAgentIds = nextWindows.map((agent) => agentIdFor(agent, activeChat.id));
    setAgentOutput((current) => {
      const next = { ...current };
      for (const agentId of startedAgentIds) delete next[agentId];
      return next;
    });
    setActiveAgents((current) => {
      const next = { ...current };
      for (const agentId of startedAgentIds) delete next[agentId];
      return next;
    });
    const results = await Promise.allSettled(
      nextWindows.map((agent) => {
        const baseInput = {
          agentId: agentIdFor(agent, activeChat.id),
          bridgeAgentId: bridgeAgentIdFor(agent),
          role: processRole(agent),
          ...(activeProject?.path ? { workspaceId: activeProject.id } : {})
        };
        return api.startAgent({ ...baseInput, cli: agent.cli });
      })
    );
    const failed = results.filter((result) => result.status === "rejected");
    const startedWindows = nextWindows.filter((_agent, index) => results[index]?.status === "fulfilled");
    if (startedWindows.length && activeChat) {
      setProjects((current) => current.map((project) => project.id === activeProject?.id
        ? { ...project, chats: project.chats.map((chat) => chat.id === activeChat.id
          ? { ...chat, teamCreated: true, windows: startedWindows }
          : chat) }
        : project));
      setConfigCollapsed(true);
    }
    announce(
      failed.length
        ? `${teamSize - failed.length} 个 Agent 已启动，${failed.length} 个失败`
        : `${teamSize} 个 CLI Agent 已启动`
    );
  }

  function stopAgent(agent: AgentWindow) {
    if (!activeChat) return;
    void window.agentTeam?.stopAgent(agentIdFor(agent, activeChat.id));
  }

  return (
    <>
      <AppIcons />
      <main className="app">
        <aside className="rail" aria-label="项目与对话">
          <div>
            <div className="window-chrome" aria-hidden="true" />

            <div className="rail-actions">
              <label className="rail-search">
                <Icon name="search" />
                <input
                  aria-label="搜索项目和对话"
                  placeholder="搜索项目、会话"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </label>
              <button className="rail-action" type="button" onClick={addProject}>
                <Icon name="plus" />
                <span>添加项目</span>
              </button>
            </div>
          </div>

          <div className="project-zone">
            <div className="rail-section-head">
              <span>项目</span>
            </div>
            <div className="projects-list">
              {filteredProjects.map((project) => (
                <section
                  className={`project-card ${project.id === activeProject?.id ? "active" : ""}`}
                  key={project.id}
                >
                  <button className="project-row" type="button" onClick={() => selectProject(project)}>
                    <Icon name="folder" />
                    <span className="project-name">{project.name}</span>
                  </button>
                  <button
                    className="icon-button project-menu-trigger"
                    type="button"
                    aria-label="项目菜单"
                    onClick={() =>
                      setOpenMenuProjectId((current) => (current === project.id ? null : project.id))
                    }
                  >
                    <Icon name="more" />
                  </button>
                  <button
                    className="icon-button project-chat-trigger"
                    type="button"
                    aria-label="新增对话"
                    onClick={() => addChat(project.id)}
                  >
                    <Icon name="edit" />
                  </button>

                  <div className="chat-list">
                    {project.chats.map((chat) => (
                      <button
                        className={`chat-row ${chat.id === activeChat?.id ? "active" : ""}`}
                        type="button"
                        key={chat.id}
                        onClick={() => selectChat(project.id, chat.id)}
                      >
                        <strong>{chat.title}</strong>
                        <time>{chat.time}</time>
                      </button>
                    ))}
                  </div>

                  {openMenuProjectId === project.id ? (
                    <div className="project-menu">
                      <button type="button" onClick={() => renameProject(project.id)}>
                        重命名项目
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuProjectId(null);
                          announce("项目路径已复制到 Bridge");
                        }}
                      >
                        复制路径
                      </button>
                      <button type="button" onClick={() => removeProject(project.id)}>
                        移除项目
                      </button>
                    </div>
                  ) : null}
                </section>
              ))}
              {!filteredProjects.length ? (
                <div className="empty-filter">没有匹配的项目或会话</div>
              ) : null}
            </div>
          </div>

        </aside>

        {toast ? <div className="toast" role="status" aria-live="polite">{toast}</div> : null}

        <section className="main" aria-label="Agent 工作台">
          <header className="session-bar">
            <div className="session-title">
              <h1>{activeChat?.title ?? "当前对话"}</h1>
              <div className="session-meta">
                {activeProject
                  ? `${activeProject.name} · ${activeProject.branch} · ${activeProject.status} · 当前对话`
                  : "等待项目"}
              </div>
            </div>
          </header>

          <section className="workspace">
            <section className="canvas" aria-label="Agent 窗口">
              {activeWindows.length ? <section
                className={`terminal-grid ${
                  activeWindows.length === 1 ? "one" : activeWindows.length === 2 ? "two" : "three"
                }`}
              >
                {activeWindows.map((agent, index) => {
                  const agentId = activeChat ? agentIdFor(agent, activeChat.id) : bridgeAgentIdFor(agent);
                  const process = agentProcesses[agentId];
                  const output = agentOutput[agentId] ?? "";
                  const running = process?.status === "running";
                  const status = processStatus(process?.status, activeAgents[agentId]);
                  return (
                  <article className={`agent-window ${index === 0 ? "first" : ""}`} key={`${activeChat?.id}-${agent.key}-${agent.cli}`}>
                    <header className="window-head">
                      <div className="agent-title">
                        <span className="cli-name">{agent.cli}</span>
                        <span className={`role ${agent.roleClass}`}>{agent.label}</span>
                      </div>
                      <div className="window-actions">
                      <span className="window-state">
                        <span
                          className={`status-dot ${status.tone}`}
                          aria-hidden="true"
                        />
                        {status.label}
                      </span>
                      {running ? <button type="button" onClick={() => stopAgent(agent)}>停止</button> : null}
                      </div>
                    </header>
                    <TerminalSurface
                      agentId={agentId}
                      intro={`AGENT_TEAM_ROLE=${terminalRole(agent)}\r\n$ ${agent.cli} --workspace agent-team-desktop\r\n${cliTerminalLine(agent.cli, cliDetections)}\r\n`}
                      output={output}
                      running={running}
                    />
                  </article>
                  );
                })}
              </section> : (
                <div className="canvas-empty">
                  <Icon name="terminal" />
                  <strong>尚未创建 CLI 窗口</strong>
                  <span>在右侧选择团队数量和 CLI，配置完成后点击“创建 CLI 窗口”。</span>
                </div>
              )}
            </section>

            <aside className="side-panel" aria-label="团队与消息">
              <section className={`panel-section config-panel ${configCollapsed ? "collapsed" : ""}`}>
                <button
                  className="config-toggle"
                  type="button"
                  aria-expanded={!configCollapsed}
                  onClick={() => setConfigCollapsed((value) => !value)}
                >
                  <Icon name="panel" />
                  <span className="config-summary">{configSummary}</span>
                  <Icon name="chevron" />
                </button>

                <div className="config-body">
                  <p className="detected">{cliSummary}</p>
                  <div className="segmented" aria-label="Agent 团队数量">
                    {[3, 2, 1].map((size) => (
                      <button
                        className={teamSize === size ? "active" : ""}
                        type="button"
                        key={size}
                        onClick={() => changeTeamSize(size as TeamSize)}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                  <div className="field-list">
                    {roles.map((role) => (
                      <label className="field" key={role.key}>
                        <span>{role.label}</span>
                        <select
                          value={assignments[role.key] ?? role.defaultCli}
                          onChange={(event) =>
                            setAssignments((current) => ({
                              ...current,
                              [role.key]: event.target.value as Cli
                            }))
                          }
                        >
                          {cliOptions.map((cli) => (
                            <option key={cli} value={cli}>
                              {cliOptionLabel(cli, cliDetections)}
                            </option>
                          ))}
                        </select>
                        <span className={`field-hint ${cliDetections[assignments[role.key] ?? role.defaultCli].status}`}>
                          {cliFieldDetail(assignments[role.key] ?? role.defaultCli, cliDetections)}
                        </span>
                      </label>
                    ))}
                  </div>
                  <button className="primary" type="button" onClick={createWindows}>
                    创建 CLI 窗口
                  </button>
                </div>
              </section>

              <section className="panel-section todo">
                <div className="panel-title">
                  <span>Todo List</span>
                  <span className="sync-pill">auto</span>
                </div>
                <div className="todo-feed" role="list">
                  {todoItems.map((todo) => (
                    <div className={`todo-item ${todo.state}`} role="listitem" key={todo.title}>
                      <span className="todo-marker">{todo.label}</span>
                      <span className="todo-text">
                        <strong>{todo.title}</strong>
                        <span>{todo.detail}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="panel-section inbox">
                <div className="panel-title">
                  <span>Bridge 收件箱</span>
                  <Icon name="inbox" />
                </div>
                {bridgeEvents.map((event) => (
                  <div className={`message ${eventMessageClass(event)}`} key={event.id}>
                    <strong>{eventTitle(event)}</strong>
                    <span>
                      {event.status} · {event.summary} · {event.time}
                    </span>
                  </div>
                ))}
              </section>
            </aside>
          </section>
        </section>
      </main>
    </>
  );
}
