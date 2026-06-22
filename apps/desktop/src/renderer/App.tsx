import { useEffect, useMemo, useRef, useState } from "react";
import type { BridgeUiEvent } from "@agent-team/protocol";
import type {
  AgentPtyEvent as AgentProcessEvent,
  AgentPtySnapshot as AgentProcessSnapshot
} from "@agent-team/agent-host";
import type { WorkspaceRecord } from "@agent-team/persistence";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const cliOptions = ["codex", "claudecode", "opencode", "mimocode"] as const;

type Cli = (typeof cliOptions)[number];
type CliStatus = "available" | "missing";
type TeamSize = 1 | 2 | 3;
type RoleClass = "plan" | "exec" | "review";
type RoleKey = "solo" | "planner" | "plannerReviewer" | "executor" | "reviewer";
type PromptProfile = "standard" | "solo" | "plannerReviewer";
type TodoState = "done" | "active" | "blocked" | "waiting";
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
  promptProfile?: PromptProfile;
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

type TodoDisplayItem = {
  id: string;
  state: TodoState;
  label: string;
  title: string;
  detail: string;
};

type PersistedRendererState = {
  version: 1;
  projects: Project[];
  activeProjectId: string;
  activeChatId: string;
  teamSize: TeamSize;
  assignments: Assignments;
  nextChatNumber: number;
  configCollapsed: boolean;
};

type AgentProcessSnapshotWithOutput = AgentProcessSnapshot & {
  output?: string;
};

const roleSets: Record<TeamSize, RoleSpec[]> = {
  1: [
    {
      key: "solo",
      label: "规划、执行、审查",
      roleClass: "plan",
      defaultCli: "claudecode",
      promptProfile: "solo"
    }
  ],
  2: [
    {
      key: "plannerReviewer",
      label: "规划、审查",
      roleClass: "plan",
      defaultCli: "codex",
      promptProfile: "plannerReviewer"
    },
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
  solo: "claudecode",
  planner: "codex",
  plannerReviewer: "codex",
  executor: "claudecode",
  reviewer: "mimocode"
};

const initialCliDetections: Record<Cli, CliDetection> = {
  codex: { id: "codex", label: "Codex", status: "available", source: "PATH", version: "detected" },
  claudecode: { id: "claudecode", label: "Claude Code", status: "available", source: "PATH", version: "detected" },
  opencode: { id: "opencode", label: "OpenCode", status: "available", source: "PATH", version: "detected" },
  mimocode: { id: "mimocode", label: "MiMo Code", status: "missing", source: "missing", reason: "需要配置路径" }
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

function projectFromWorkspace(workspace: WorkspaceRecord, index: number): Project {
  return {
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
  };
}

function hydrateProjects(savedProjects: Project[], workspaces: WorkspaceRecord[]) {
  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  const hydrated = savedProjects.map((project) => {
    const workspace = workspaceById.get(project.id);
    if (!workspace) return project;
    return {
      ...project,
      name: workspace.name,
      branch: workspace.branch ?? "no git",
      status: workspace.available ? (workspace.dirty ? "dirty" : "clean") : "missing",
      path: workspace.path,
      available: workspace.available
    };
  });
  const savedIds = new Set(savedProjects.map((project) => project.id));
  return [
    ...hydrated,
    ...workspaces
      .filter((workspace) => !savedIds.has(workspace.id))
      .map((workspace, index) => projectFromWorkspace(workspace, savedProjects.length + index))
  ];
}

function isPersistedRendererState(value: unknown): value is PersistedRendererState {
  const state = value && typeof value === "object" ? value as Partial<PersistedRendererState> : null;
  return Boolean(
    state &&
    state.version === 1 &&
    Array.isArray(state.projects) &&
    (state.teamSize === 1 || state.teamSize === 2 || state.teamSize === 3) &&
    typeof state.activeProjectId === "string" &&
    typeof state.activeChatId === "string"
  );
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
  return role.key === "solo" || role.key === "plannerReviewer" ? "planner" : role.key;
}

function processStatus(status?: AgentProcessSnapshot["status"], active = false) {
  if (status === "running" && active) return { label: "工作中", tone: "running" };
  if (status === "running") return { label: "已就绪", tone: "ready" };
  if (status === "failed") return { label: "启动失败", tone: "warning" };
  if (status === "exited") return { label: "已停止", tone: "stopped" };
  return { label: "等待中", tone: "pending" };
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

function objectPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function todoStateFrom(status: unknown): TodoState {
  if (status === "completed") return "done";
  if (status === "active") return "active";
  if (status === "blocked") return "blocked";
  return "waiting";
}

function todoLabelFrom(state: TodoState) {
  if (state === "done") return "done";
  if (state === "active") return "next";
  if (state === "blocked") return "block";
  return "wait";
}

function todoDetailFrom(payload: Record<string, unknown>, fallbackOwner: string) {
  const detail = optionalString(payload.detail);
  const owner = optionalString(payload.ownerRole) || optionalString(payload.ownerAgentId) || fallbackOwner;
  const evidence = Array.isArray(payload.evidenceIds) && payload.evidenceIds.length
    ? ` · ${payload.evidenceIds.length} 条证据`
    : "";
  return detail || owner ? `${owner}${detail ? ` · ${detail}` : ""}${evidence}` : "等待更新";
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
  output,
  running
}: {
  agentId: string;
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
      convertEol: false,
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
    terminal.focus();
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
    const focusTerminal = () => terminal.focus();
    host.addEventListener("pointerdown", focusTerminal);

    return () => {
      observer.disconnect();
      dataSubscription.dispose();
      host.removeEventListener("pointerdown", focusTerminal);
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [agentId]);

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
  const [platformId, setPlatformId] = useState("");
  const [teamSize, setTeamSize] = useState<TeamSize>(3);
  const [assignments, setAssignments] = useState<Assignments>(initialAssignments);
  const [configCollapsed, setConfigCollapsed] = useState(false);
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [activeChatId, setActiveChatId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [openMenuProjectId, setOpenMenuProjectId] = useState<string | null>(null);
  const [openMenuChatKey, setOpenMenuChatKey] = useState<string | null>(null);
  const [editingChatKey, setEditingChatKey] = useState<string | null>(null);
  const [editingChatTitle, setEditingChatTitle] = useState("");
  const [nextChatNumber, setNextChatNumber] = useState(2);
  const [toast, setToast] = useState("");
  const [agentProcesses, setAgentProcesses] = useState<Record<string, AgentProcessSnapshot>>({});
  const [agentOutput, setAgentOutput] = useState<Record<string, string>>({});
  const [activeAgents, setActiveAgents] = useState<Record<string, boolean>>({});
  const activityTimersRef = useRef<Record<string, number>>({});
  const restoredStateRef = useRef(false);
  const [runtimeBridgeEvents, setRuntimeBridgeEvents] = useState<BridgeUiEvent[]>([]);
  const { project: activeProject, chat: activeChat } = activeFrom(projects, activeProjectId, activeChatId);
  const roles = roleSets[teamSize];
  const activeWindows = activeChat?.windows ?? [];
  const revealWorkspaceLabel = platformId === "macos" ? "在 Finder 中显示" : "在文件夹中显示";

  useEffect(() => {
    void window.agentTeam?.getBootstrap().then((bootstrap) => setPlatformId(bootstrap.platformId));
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
    const api = window.agentTeam;
    if (!api) {
      restoredStateRef.current = true;
      return;
    }

    void Promise.all([api.getDesktopState(), api.listWorkspaces()]).then(([saved, workspaces]) => {
      const savedValue = saved?.value;
      if (isPersistedRendererState(savedValue)) {
        const restored = hydrateProjects(savedValue.projects, workspaces);
        setProjects(restored);
        setActiveProjectId(
          restored.some((project) => project.id === savedValue.activeProjectId)
            ? savedValue.activeProjectId
            : restored[0]?.id ?? ""
        );
        const activeProject = restored.find((project) => project.id === savedValue.activeProjectId) ?? restored[0];
        setActiveChatId(
          activeProject?.chats.some((chat) => chat.id === savedValue.activeChatId)
            ? savedValue.activeChatId
            : activeProject?.chats[0]?.id ?? ""
        );
        setTeamSize(savedValue.teamSize);
        setAssignments({ ...initialAssignments, ...savedValue.assignments });
        setNextChatNumber(Math.max(2, savedValue.nextChatNumber || 2));
        setConfigCollapsed(savedValue.configCollapsed);
      } else if (workspaces.length) {
        const restored = workspaces.map(projectFromWorkspace);
        setProjects(restored);
        setActiveProjectId(restored[0]?.id ?? "");
        setActiveChatId(restored[0]?.chats[0]?.id ?? "");
      }
      restoredStateRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (!restoredStateRef.current) return;
    const api = window.agentTeam;
    if (!api) return;
    const timer = window.setTimeout(() => {
      const state: PersistedRendererState = {
        version: 1,
        projects,
        activeProjectId,
        activeChatId,
        teamSize,
        assignments,
        nextChatNumber,
        configCollapsed
      };
      void api.saveDesktopState(state);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activeChatId, activeProjectId, assignments, configCollapsed, nextChatNumber, projects, teamSize]);

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
      setAgentOutput(Object.fromEntries(processes
        .map((process) => process as AgentProcessSnapshotWithOutput)
        .filter((process) => process.output)
        .map((process) => [process.agentId, process.output ?? ""])
      ));
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
    () => `${teamSize} 人团队 · ${roles
      .map((role) => cliDetections[assignments[role.key] ?? role.defaultCli].label)
      .join(" / ")}`,
    [assignments, cliDetections, roles, teamSize]
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

  const realTodoItems = useMemo(() => {
    const items = new Map<string, TodoDisplayItem>();
    for (const event of bridgeEvents) {
      if (event.type !== "todo.created" && event.type !== "todo.updated") continue;
      const payload = objectPayload(event.payload);
      const id = optionalString(payload.id);
      if (!id) continue;

      const current = items.get(id);
      const title = optionalString(payload.title) || current?.title || id;
      const state = payload.status ? todoStateFrom(payload.status) : current?.state ?? "waiting";
      items.set(id, {
        id,
        state,
        label: todoLabelFrom(state),
        title,
        detail: todoDetailFrom(payload, event.from) || current?.detail || "等待更新"
      });
    }
    return [...items.values()];
  }, [bridgeEvents]);

  const fallbackTodoItems = useMemo(() => {
    const hasReviewer = roles.some((role) =>
      role.key === "solo" || role.key === "reviewer" || role.key === "plannerReviewer"
    );
    const plannerCli = assignments.solo ?? assignments.planner ?? assignments.plannerReviewer ?? "codex";
    const executorCli = assignments.solo ?? assignments.executor ?? "claudecode";
    const reviewerCli = assignments.solo ?? assignments.reviewer ?? assignments.plannerReviewer ?? "mimocode";
    const teamCreated = Boolean(activeChat?.teamCreated);
    const taskAssigned = hasBridgeEvent(bridgeEvents, "task.assigned");
    const taskCompleted = hasBridgeEvent(bridgeEvents, "task.completed");
    const reviewRequested = hasBridgeEvent(bridgeEvents, "review.requested");
    const reviewReported = hasBridgeEvent(bridgeEvents, "review.reported");
    const approvalGranted = hasBridgeEvent(bridgeEvents, "approval.granted");

    const items: TodoDisplayItem[] = [
      {
        id: "select-session",
        state: activeChat ? "done" : "active",
        label: activeChat ? "done" : "next",
        title: "选择工作区会话",
        detail: activeChat ? `${activeChat.title} · 当前会话已选中` : "等待当前对话"
      },
      {
        id: "create-windows",
        state: teamCreated ? "done" : "active",
        label: teamCreated ? "done" : "next",
        title: "生成 Agent 窗口",
        detail: teamCreated ? `${activeWindows.length || teamSize} 个窗口已连接 smux-bridge` : "等待创建当前对话的 Agent 窗口"
      },
      {
        id: "assign-task",
        state: taskAssigned ? "done" : teamCreated ? "active" : "waiting",
        label: taskAssigned ? "done" : teamCreated ? "next" : "wait",
        title: "派发执行任务",
        detail: taskAssigned ? `${plannerCli} -> ${executorCli} · task.assigned 已 ACK` : `${plannerCli} 准备任务包`
      },
      {
        id: "complete-task",
        state: taskCompleted ? "done" : taskAssigned ? "active" : "waiting",
        label: taskCompleted ? "done" : taskAssigned ? "next" : "wait",
        title: "回收执行结果",
        detail: taskCompleted ? `${executorCli} 已提交 task.completed` : `${executorCli} 等待完成报告`
      }
    ];

    items.push(
      hasReviewer
        ? {
            id: "review-task",
            state: reviewReported ? "done" : reviewRequested || taskCompleted ? "active" : "waiting",
            label: reviewReported ? "done" : reviewRequested || taskCompleted ? "next" : "wait",
            title: "审查 Diff 与证据",
            detail: reviewReported ? `${reviewerCli} 已提交 review.reported` : `${reviewerCli} 等待 review.requested`
          }
        : {
            id: "sync-result",
            state: taskCompleted ? "active" : "waiting",
            label: taskCompleted ? "next" : "wait",
            title: "回写执行结果",
            detail: "执行完成后由 Bridge 同步消息与证据"
          }
    );

    items.push({
      id: "approve-task",
      state: approvalGranted ? "done" : reviewReported || (!hasReviewer && taskCompleted) ? "active" : "waiting",
      label: approvalGranted ? "done" : reviewReported || (!hasReviewer && taskCompleted) ? "next" : "wait",
      title: "验收并批准",
      detail: approvalGranted ? "approval.granted 已写入 Bridge" : "等待 planner 查看 diff 与证据"
    });

    return items;
  }, [activeChat, assignments, bridgeEvents, roles, teamSize]);

  const todoItems = realTodoItems.length ? realTodoItems : fallbackTodoItems;

  function announce(message: string) {
    setToast(message);
  }

  function selectProject(project: Project) {
    setActiveProjectId(project.id);
    setActiveChatId(project.chats[0]?.id ?? "");
    setOpenMenuProjectId(null);
    setOpenMenuChatKey(null);
    setEditingChatKey(null);
    setEditingChatTitle("");
  }

  function selectChat(projectId: string, chatId: string) {
    setActiveProjectId(projectId);
    setActiveChatId(chatId);
    setOpenMenuProjectId(null);
    setOpenMenuChatKey(null);
    setEditingChatKey(null);
    setEditingChatTitle("");
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
    setOpenMenuChatKey(null);
    setEditingChatKey(null);
    setEditingChatTitle("");
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
    setOpenMenuChatKey(null);
    setEditingChatKey(null);
    setEditingChatTitle("");
    setNextChatNumber((value) => value + 1);
    announce("新对话已创建");
  }

  function renameProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    const nextName = window.prompt("重命名项目", project?.name ?? "");
    const trimmed = nextName?.trim();
    if (!trimmed) {
      setOpenMenuProjectId(null);
      return;
    }

    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? { ...project, name: trimmed }
          : project
      )
    );
    setOpenMenuProjectId(null);
    setOpenMenuChatKey(null);
    announce("项目已重命名");
  }

  function pinProject(projectId: string) {
    setProjects((current) => {
      const project = current.find((item) => item.id === projectId);
      if (!project) return current;
      return [project, ...current.filter((item) => item.id !== projectId)];
    });
    setOpenMenuProjectId(null);
    setOpenMenuChatKey(null);
    announce("项目已置顶");
  }

  async function showProjectInFolder(projectId: string) {
    const shown = await window.agentTeam?.showWorkspaceInFolder(projectId);
    setOpenMenuProjectId(null);
    setOpenMenuChatKey(null);
    announce(shown ? "已打开项目位置" : "项目位置不可用");
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
    setOpenMenuChatKey(null);
    announce("项目已移除");
  }

  function chatMenuKey(projectId: string, chatId: string) {
    return `${projectId}:${chatId}`;
  }

  function beginRenameChat(projectId: string, chat: Chat) {
    setOpenMenuChatKey(null);
    setOpenMenuProjectId(null);
    setEditingChatKey(chatMenuKey(projectId, chat.id));
    setEditingChatTitle(chat.title);
  }

  function cancelRenameChat() {
    setEditingChatKey(null);
    setEditingChatTitle("");
  }

  function commitRenameChat(projectId: string, chatId: string) {
    if (editingChatKey !== chatMenuKey(projectId, chatId)) return;

    const trimmed = editingChatTitle.trim();
    if (!trimmed) {
      cancelRenameChat();
      return;
    }

    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              chats: project.chats.map((chat) => chat.id === chatId ? { ...chat, title: trimmed } : chat)
            }
          : project
      )
    );
    cancelRenameChat();
    announce("对话已重命名");
  }

  function removeChat(projectId: string, chatId: string) {
    const project = projects.find((item) => item.id === projectId);
    if (!project || project.chats.length <= 1) {
      setOpenMenuChatKey(null);
      announce("至少保留一个对话");
      return;
    }

    const nextChats = project.chats.filter((chat) => chat.id !== chatId);
    const nextChat = nextChats[0];
    setProjects((current) =>
      current.map((project) => project.id === projectId ? { ...project, chats: nextChats } : project)
    );
    if (activeProjectId === projectId && activeChatId === chatId) {
      setActiveChatId(nextChat?.id ?? "");
    }
    setOpenMenuChatKey(null);
    cancelRenameChat();
    announce("对话已移除");
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
          ...(agent.promptProfile ? { promptProfile: agent.promptProfile } : {}),
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
                      setOpenMenuProjectId((current) => {
                        setOpenMenuChatKey(null);
                        return current === project.id ? null : project.id;
                      })
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

                  {openMenuProjectId === project.id ? (
                    <div className="project-menu">
                      <button type="button" onClick={() => pinProject(project.id)}>
                        置顶项目
                      </button>
                      <button type="button" onClick={() => renameProject(project.id)}>
                        重命名项目
                      </button>
                      <button type="button" onClick={() => void showProjectInFolder(project.id)}>
                        {revealWorkspaceLabel}
                      </button>
                      <button type="button" onClick={() => removeProject(project.id)}>
                        移除项目
                      </button>
                    </div>
                  ) : null}

                  <div className="chat-list">
                    {project.chats.map((chat) => {
                      const key = chatMenuKey(project.id, chat.id);
                      const editing = editingChatKey === key;
                      return (
                        <div className="chat-item" key={chat.id}>
                          {editing ? (
                            <input
                              className="chat-rename-input"
                              aria-label="对话名称"
                              autoFocus
                              value={editingChatTitle}
                              onChange={(event) => setEditingChatTitle(event.target.value)}
                              onBlur={() => commitRenameChat(project.id, chat.id)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  commitRenameChat(project.id, chat.id);
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  cancelRenameChat();
                                }
                              }}
                            />
                          ) : (
                            <button
                              className={`chat-row ${chat.id === activeChat?.id ? "active" : ""}`}
                              type="button"
                              onClick={() => selectChat(project.id, chat.id)}
                            >
                              <strong>{chat.title}</strong>
                              <time>{chat.time}</time>
                            </button>
                          )}
                          {!editing ? (
                            <button
                              className="icon-button chat-menu-trigger"
                              type="button"
                              aria-label="对话菜单"
                              onClick={() => {
                                setOpenMenuProjectId(null);
                                setEditingChatKey(null);
                                setEditingChatTitle("");
                                setOpenMenuChatKey((current) =>
                                  current === key ? null : key
                                );
                              }}
                            >
                              <Icon name="more" />
                            </button>
                          ) : null}
                          {openMenuChatKey === key ? (
                            <div className="chat-menu">
                              <button type="button" onClick={() => beginRenameChat(project.id, chat)}>
                                重命名对话
                              </button>
                              <button type="button" onClick={() => removeChat(project.id, chat.id)}>
                                移除对话
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
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
                        <span className="cli-name">{cliDetections[agent.cli].label}</span>
                        <span className={`role ${agent.roleClass}`}>{agent.label}</span>
                      </div>
                      <div className="window-actions">
                      <span className={`window-state ${status.tone}`}>
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
                  <span className="sync-pill">{realTodoItems.length ? "live" : "flow"}</span>
                </div>
                <div className="todo-feed" role="list">
                  {todoItems.map((todo) => (
                    <div className={`todo-item ${todo.state}`} role="listitem" key={todo.id}>
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
