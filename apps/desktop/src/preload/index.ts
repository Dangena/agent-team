import type {
  AgentProcessEvent,
  AgentProcessSnapshot,
  DesktopBootstrap,
  StartFakeAgentInput
} from "../main/main";
import type { StartAgentInput } from "../main/main";
import { contextBridge, ipcRenderer } from "electron";
import type { BridgeUiEvent } from "@agent-team/protocol";
import type { DetectionResult } from "@agent-team/cli-adapters";
import type { WorkspaceRecord } from "@agent-team/persistence";

export type AgentTeamApi = {
  getBootstrap(): Promise<DesktopBootstrap>;
  listCliAdapters(): Promise<DetectionResult[]>;
  listWorkspaces(): Promise<WorkspaceRecord[]>;
  importWorkspace(): Promise<WorkspaceRecord | null>;
  removeWorkspace(workspaceId: string): Promise<boolean>;
  listBridgeUiEvents(sessionId: string): Promise<BridgeUiEvent[]>;
  startFakeAgent(input: StartFakeAgentInput): Promise<AgentProcessSnapshot>;
  startAgent(input: StartAgentInput): Promise<AgentProcessSnapshot>;
  stopAgent(agentId: string): Promise<boolean>;
  listAgentProcesses(): Promise<AgentProcessSnapshot[]>;
  writeTerminal(agentId: string, data: string): Promise<boolean>;
  resizeTerminal(agentId: string, cols: number, rows: number): Promise<boolean>;
  onAgentProcessEvent(listener: (event: AgentProcessEvent) => void): () => void;
};

declare global {
  interface Window {
    agentTeam?: AgentTeamApi;
  }
}

export const api: AgentTeamApi = {
  getBootstrap() {
    return ipcRenderer.invoke("agent-team:get-bootstrap");
  },
  listCliAdapters() {
    return ipcRenderer.invoke("agent-team:list-cli-adapters");
  },
  listWorkspaces() {
    return ipcRenderer.invoke("agent-team:list-workspaces");
  },
  importWorkspace() {
    return ipcRenderer.invoke("agent-team:import-workspace");
  },
  removeWorkspace(workspaceId) {
    return ipcRenderer.invoke("agent-team:remove-workspace", workspaceId);
  },
  startFakeAgent(input) {
    return ipcRenderer.invoke("agent-team:start-fake-agent", input);
  },
  startAgent(input) {
    return ipcRenderer.invoke("agent-team:start-agent", input);
  },
  stopAgent(agentId) {
    return ipcRenderer.invoke("agent-team:stop-agent", agentId);
  },
  listAgentProcesses() {
    return ipcRenderer.invoke("agent-team:list-agent-processes");
  },
  writeTerminal(agentId, data) {
    return ipcRenderer.invoke("agent-team:write-terminal", agentId, data);
  },
  resizeTerminal(agentId, cols, rows) {
    return ipcRenderer.invoke("agent-team:resize-terminal", agentId, cols, rows);
  },
  onAgentProcessEvent(listener) {
    const handler = (_event: Electron.IpcRendererEvent, processEvent: AgentProcessEvent) => listener(processEvent);
    ipcRenderer.on("agent-team:agent-process-event", handler);
    return () => ipcRenderer.removeListener("agent-team:agent-process-event", handler);
  },
  listBridgeUiEvents(sessionId) {
    return ipcRenderer.invoke("agent-team:list-bridge-ui-events", sessionId);
  }
};

contextBridge.exposeInMainWorld("agentTeam", api);
