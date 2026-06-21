import type { AgentRole } from "./roles";

export const TASK_STATUSES = [
  "backlog",
  "assigned",
  "acknowledged",
  "in_progress",
  "review_pending",
  "changes_requested",
  "blocked",
  "approved",
  "cancelled"
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type TaskScope = {
  paths: string[];
  notes?: string;
};

export type AcceptanceCriterion = {
  id: string;
  text: string;
  required: boolean;
};

export type AgentTask = {
  id: string;
  objective: string;
  scope: TaskScope;
  acceptance: AcceptanceCriterion[];
  assigneeRole: Extract<AgentRole, "executor">;
  status: TaskStatus;
};

export type CompletionReport = {
  taskId: string;
  changed: string[];
  tests: TestEvidence[];
  risks: string[];
};

export type TestEvidence = {
  command: string;
  cwd: string;
  exitCode: number | null;
  durationMs?: number;
  logArtifactPath?: string;
  note?: string;
};
