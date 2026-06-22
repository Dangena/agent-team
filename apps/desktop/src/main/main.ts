import { createPlatformServices } from "@agent-team/platform";
import {
  createBuiltInAdapter,
  detectAllBuiltInAdapters,
  type BuiltInCliAdapterId
} from "@agent-team/cli-adapters";
import { createDesktopRepository, type DesktopRepository, type WorkspaceRecord } from "@agent-team/persistence";
import {
  createBridgeRuntime,
  createBridgeTransportServer,
  createAgentPtyManager,
  createInMemoryBridgeEventStore,
  type BridgeRuntime,
  type BridgeTransportServer,
  type AgentPtyEvent,
  type AgentPtySnapshot
} from "@agent-team/agent-host";
import { toBridgeUiEvents } from "@agent-team/protocol";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { delimiter } from "node:path";
import { homedir } from "node:os";

const platform = createPlatformServices(process.platform);
let repository: DesktopRepository | null = null;
const bridgeToken = randomUUID();
let bridgeRuntime: BridgeRuntime | null = null;
let bridgeServer: BridgeTransportServer | null = null;
let cachedCliEnvironment: NodeJS.ProcessEnv | null = null;
const agentOutputBuffers = new Map<string, string>();
const processManager = createAgentPtyManager((event) => {
  if (event.type === "output" && event.data) {
    agentOutputBuffers.set(event.agentId, `${agentOutputBuffers.get(event.agentId) ?? ""}${event.data}`.slice(-100_000));
  }
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("agent-team:agent-process-event", event);
  }
});

export type StartFakeAgentInput = {
  agentId: string;
  bridgeAgentId?: string;
  promptProfile?: "standard" | "solo" | "plannerReviewer";
  role: "planner" | "executor" | "reviewer";
  workspaceId?: string;
};
export type StartAgentInput = StartFakeAgentInput & { cli: BuiltInCliAdapterId };
export type AgentProcessEvent = AgentPtyEvent;
export type AgentProcessSnapshot = AgentPtySnapshot & { output?: string };

export type DesktopBootstrap = {
  platformId: string;
  defaultShell: string;
  bridgeTransport: string;
};

export function createDesktopBootstrap(): DesktopBootstrap {
  return {
    platformId: platform.id,
    defaultShell: platform.defaultShell(),
    bridgeTransport: platform.bridgeTransport
  };
}

export async function listDesktopCliAdapters() {
  return detectAllBuiltInAdapters({ env: desktopCliEnvironment() });
}

function desktopCliEnvironment(): NodeJS.ProcessEnv {
  if (cachedCliEnvironment) return cachedCliEnvironment;
  const env = { ...process.env };
  const pathEntries = new Set((env.PATH ?? "").split(delimiter).filter(Boolean));
  if (process.platform === "darwin") {
    const shell = env.SHELL ?? "/bin/zsh";
    try {
      const loginPath = execFileSync(shell, ["-ilc", "printf %s \"$PATH\""], {
        encoding: "utf8",
        timeout: 5_000,
        env,
        stdio: ["ignore", "pipe", "ignore"]
      });
      for (const entry of loginPath.split(delimiter)) if (entry) pathEntries.add(entry);
    } catch {
      // Common user installation paths below remain available as fallback.
    }
    const home = homedir();
    for (const entry of [
      "/opt/homebrew/bin", "/usr/local/bin", `${home}/.local/bin`, `${home}/Library/pnpm`,
      `${home}/.local/share/pnpm`, `${home}/.volta/bin`, `${home}/.bun/bin`, `${home}/.cargo/bin`
    ]) pathEntries.add(entry);
  }
  env.PATH = [...pathEntries].join(delimiter);
  cachedCliEnvironment = env;
  return env;
}

function getRepository(): DesktopRepository {
  if (!repository) throw new Error("desktop repository is not ready");
  return repository;
}

function gitValue(workspacePath: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", workspacePath, ...args], {
      encoding: "utf8",
      timeout: 3_000,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim() || null;
  } catch {
    return null;
  }
}

function inspectWorkspace(workspacePath: string, existingId?: string): WorkspaceRecord {
  const normalizedPath = realpathSync(workspacePath);
  const status = gitValue(normalizedPath, ["status", "--porcelain"]);
  return {
    id: existingId ?? `ws_${randomUUID()}`,
    path: normalizedPath,
    name: basename(normalizedPath),
    branch: gitValue(normalizedPath, ["branch", "--show-current"]),
    dirty: Boolean(status),
    available: true,
    lastOpenedAt: new Date().toISOString()
  };
}

function selectedWorkspacePath(workspaceId?: string): string {
  const projectRoot = resolve(app.getAppPath(), "../..");
  if (!workspaceId) return projectRoot;
  const workspace = getRepository().listWorkspaces().find((item) => item.id === workspaceId);
  if (!workspace?.available || !existsSync(workspace.path)) throw new Error("workspace is unavailable");
  return workspace.path;
}

function bridgeEnvironment(input: StartFakeAgentInput): Record<string, string> {
  if (!bridgeServer) throw new Error("bridge server is not ready");
  return {
    AGENT_TEAM_AGENT_ID: input.bridgeAgentId ?? input.agentId,
    AGENT_TEAM_ROLE: input.role,
    AGENT_TEAM_SESSION_ID: "ses_desktop_preview",
    AGENT_TEAM_TOKEN: bridgeToken,
    AGENT_TEAM_SOCKET: bridgeServer.endpoint,
    PATH: desktopCliEnvironment().PATH ?? "",
    AGENT_TEAM_BRIDGE_BIN: app.isPackaged
      ? join(process.resourcesPath, "bin/agent-team-bridge.mjs")
      : join(resolve(app.getAppPath(), "../.."), "resources/bin/agent-team-bridge.mjs")
  };
}

function assertTrustedIpcSender(event: IpcMainInvokeEvent) {
  const url = event.senderFrame?.url ?? event.sender.getURL();
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl && url.startsWith(devUrl)) return;
  if (!app.isPackaged && url.startsWith("http://localhost:")) return;
  if (url.startsWith("file:") && url.includes("/out/renderer/")) return;
  throw new Error("untrusted IPC sender");
}

function registerIpcHandlers() {
  ipcMain.handle("agent-team:get-bootstrap", () => createDesktopBootstrap());
  ipcMain.handle("agent-team:list-cli-adapters", () => listDesktopCliAdapters());
  ipcMain.handle("agent-team:get-desktop-state", (event) => {
    assertTrustedIpcSender(event);
    return getRepository().getAppState("renderer");
  });
  ipcMain.handle("agent-team:save-desktop-state", (event, value: unknown) => {
    assertTrustedIpcSender(event);
    return getRepository().saveAppState({
      key: "renderer",
      value,
      updatedAt: new Date().toISOString()
    });
  });
  ipcMain.handle("agent-team:list-bridge-ui-events", (_event, sessionId: string) => {
    if (!bridgeRuntime) return [];
    const events = bridgeRuntime.listEvents().filter((event) => event.sessionId === sessionId);
    const acknowledgements = ["preview-planner", "preview-executor", "preview-reviewer"].flatMap((agentId) =>
      bridgeRuntime?.listAcknowledgements(agentId).map((eventId) => ({
        agentId,
        eventId,
        ackedAt: new Date().toISOString()
      })) ?? []
    );
    return toBridgeUiEvents(events, acknowledgements);
  });
  ipcMain.handle("agent-team:list-workspaces", (event) => {
    assertTrustedIpcSender(event);
    const store = getRepository();
    return store.listWorkspaces().map((workspace) => {
      if (!existsSync(workspace.path)) return { ...workspace, available: false };
      return inspectWorkspace(workspace.path, workspace.id);
    });
  });
  ipcMain.handle("agent-team:import-workspace", async (event) => {
    assertTrustedIpcSender(event);
    const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
    const selectedPath = result.filePaths[0];
    if (result.canceled || !selectedPath) return null;
    return getRepository().upsertWorkspace(inspectWorkspace(selectedPath));
  });
  ipcMain.handle("agent-team:remove-workspace", (event, workspaceId: string) => {
    assertTrustedIpcSender(event);
    return getRepository().removeWorkspace(workspaceId);
  });
  ipcMain.handle("agent-team:show-workspace-in-folder", (event, workspaceId: string) => {
    assertTrustedIpcSender(event);
    const workspace = getRepository().listWorkspaces().find((item) => item.id === workspaceId);
    if (!workspace?.available || !existsSync(workspace.path)) return false;
    shell.showItemInFolder(workspace.path);
    return true;
  });
  ipcMain.handle(
    "agent-team:start-fake-agent",
    (event, input: StartFakeAgentInput): AgentProcessSnapshot => {
      assertTrustedIpcSender(event);
      if (!/^[a-z][a-z0-9_-]{0,63}$/i.test(input.agentId)) {
        throw new Error("invalid agent id");
      }
      if (input.bridgeAgentId && !/^[a-z][a-z0-9_-]{0,63}$/i.test(input.bridgeAgentId)) {
        throw new Error("invalid bridge agent id");
      }
      if (!["planner", "executor", "reviewer"].includes(input.role)) {
        throw new Error("invalid agent role");
      }

      const projectRoot = app.isPackaged ? process.resourcesPath : resolve(app.getAppPath(), "../..");
      const workspaceRoot = selectedWorkspacePath(input.workspaceId);
      const fakeScript = app.isPackaged
        ? join(process.resourcesPath, "test-fixtures/fake-agent-cli.mjs")
        : join(projectRoot, "packages/test-fixtures/bin/fake-agent-cli.mjs");
      const executable = process.platform === "win32" ? process.execPath : "/usr/bin/env";
      const args = process.platform === "win32"
        ? [fakeScript, "--role", input.role]
        : ["node", fakeScript, "--role", input.role];
      agentOutputBuffers.delete(input.agentId);
      return processManager.start({
        agentId: input.agentId,
        executable,
        args,
        cwd: workspaceRoot,
        env: {
          ELECTRON_RUN_AS_NODE: "1",
          ...bridgeEnvironment(input)
        }
      });
    }
  );
  ipcMain.handle("agent-team:start-agent", async (event, input: StartAgentInput): Promise<AgentProcessSnapshot> => {
    assertTrustedIpcSender(event);
    if (!/^[a-z][a-z0-9_-]{0,63}$/i.test(input.agentId)) throw new Error("invalid agent id");
    if (input.bridgeAgentId && !/^[a-z][a-z0-9_-]{0,63}$/i.test(input.bridgeAgentId)) {
      throw new Error("invalid bridge agent id");
    }
    const workspacePath = selectedWorkspacePath(input.workspaceId);
    const adapter = createBuiltInAdapter(input.cli, undefined, { env: desktopCliEnvironment() });
    const launch = await adapter.buildLaunchSpec({
      workspacePath,
      role: input.role,
      ...(input.promptProfile ? { promptProfile: input.promptProfile } : {}),
      bridgeEnv: bridgeEnvironment(input)
    });
    agentOutputBuffers.delete(input.agentId);
    const snapshot = processManager.start({
      agentId: input.agentId,
      executable: launch.executable,
      args: launch.args,
      cwd: launch.cwd,
      env: launch.env
    });
    if (launch.initialInput) {
      setTimeout(() => {
        processManager.write(input.agentId, launch.initialInput ?? "");
      }, launch.initialInputDelayMs ?? 1_200);
    }
    return snapshot;
  });
  ipcMain.handle("agent-team:stop-agent", (event, agentId: string) => {
    assertTrustedIpcSender(event);
    return processManager.stop(agentId);
  });
  ipcMain.handle("agent-team:list-agent-processes", (): AgentProcessSnapshot[] =>
    processManager.list().map((snapshot) => {
      const output = agentOutputBuffers.get(snapshot.agentId);
      return output ? { ...snapshot, output } : snapshot;
    })
  );
  ipcMain.handle("agent-team:write-terminal", (event, agentId: string, data: string) => {
    assertTrustedIpcSender(event);
    if (data.length > 64 * 1024) throw new Error("terminal input exceeds 64 KiB");
    return processManager.write(agentId, data);
  });
  ipcMain.handle("agent-team:resize-terminal", (event, agentId: string, cols: number, rows: number) => {
    assertTrustedIpcSender(event);
    return processManager.resize(agentId, cols, rows);
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#f4f1eb",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  repository = createDesktopRepository(join(app.getPath("userData"), "agent-team-desktop.db"));
  bridgeRuntime = createBridgeRuntime(bridgeToken, createInMemoryBridgeEventStore());
  const endpoint = process.platform === "win32"
    ? `\\\\.\\pipe\\agent-team-desktop-${process.pid}`
    : join(app.getPath("userData"), "agent-team-desktop.sock");
  bridgeServer = createBridgeTransportServer(endpoint, bridgeRuntime);
  await bridgeServer.start();
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  processManager.stopAll();
  void bridgeServer?.close();
});
app.on("will-quit", () => {
  repository?.close();
  repository = null;
  bridgeRuntime = null;
  bridgeServer = null;
});
