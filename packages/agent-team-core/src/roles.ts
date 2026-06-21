export const DEFAULT_ROLES = ["planner", "executor", "reviewer", "observer"] as const;

export type AgentRole = (typeof DEFAULT_ROLES)[number];

export type RoleContract = {
  role: AgentRole;
  canWriteWorkspace: boolean;
  canAssignTasks: boolean;
  canApproveTasks: boolean;
  canReportReview: boolean;
  description: string;
};

export const ROLE_CONTRACTS: Record<AgentRole, RoleContract> = {
  planner: {
    role: "planner",
    canWriteWorkspace: false,
    canAssignTasks: true,
    canApproveTasks: true,
    canReportReview: true,
    description: "Plans work, assigns tasks, routes review, and owns final acceptance."
  },
  executor: {
    role: "executor",
    canWriteWorkspace: true,
    canAssignTasks: false,
    canApproveTasks: false,
    canReportReview: false,
    description: "Implements scoped tasks, runs checks, and reports evidence."
  },
  reviewer: {
    role: "reviewer",
    canWriteWorkspace: false,
    canAssignTasks: false,
    canApproveTasks: false,
    canReportReview: true,
    description: "Reviews changes and reports findings without final approval authority."
  },
  observer: {
    role: "observer",
    canWriteWorkspace: false,
    canAssignTasks: false,
    canApproveTasks: false,
    canReportReview: false,
    description: "Watches the session or acts as a manually controlled terminal."
  }
};

export function assertSingleExecutor(roles: AgentRole[]): void {
  const executors = roles.filter((role) => role === "executor");
  if (executors.length > 1) {
    throw new Error("shared workspaces allow only one executor");
  }
}
