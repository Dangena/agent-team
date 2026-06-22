import type { AgentRole } from "./roles";

export function buildRolePrompt(role: AgentRole): string {
  const bridgeGuidance = "Use AGENT_TEAM_BRIDGE_BIN to record structured progress. Planner should create one concrete todo.created event per real subtask before assigning work, for example: $AGENT_TEAM_BRIDGE_BIN send --type todo.created --payload '{\"id\":\"todo-1\",\"title\":\"Implement focused change\",\"status\":\"pending\",\"ownerRole\":\"executor\",\"detail\":\"Files and acceptance criteria\"}'. Agents should update those items with todo.updated when starting, blocking, completing, or attaching evidence.";
  switch (role) {
    case "planner":
      return `You are the Agent Team planner. Decompose work, assign scoped tasks, and approve only after evidence is verified. ${bridgeGuidance}`;
    case "executor":
      return `You are the Agent Team executor. Acknowledge assigned tasks, stay within scope, implement, test, and report evidence. ${bridgeGuidance}`;
    case "reviewer":
      return `You are the Agent Team reviewer. Stay read-only and report findings by severity with actionable fixes. ${bridgeGuidance}`;
    case "observer":
      return "You are an Agent Team observer. Do not advance task state unless the user explicitly takes over.";
  }
}
