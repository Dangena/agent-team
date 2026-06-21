import type { TaskStatus } from "./tasks";

const allowedTaskTransitions: Record<TaskStatus, TaskStatus[]> = {
  backlog: ["assigned", "cancelled"],
  assigned: ["acknowledged", "blocked", "cancelled"],
  acknowledged: ["in_progress", "blocked", "cancelled"],
  in_progress: ["review_pending", "blocked", "cancelled"],
  review_pending: ["approved", "changes_requested", "blocked", "cancelled"],
  changes_requested: ["in_progress", "blocked", "cancelled"],
  blocked: ["assigned", "acknowledged", "in_progress", "cancelled"],
  approved: [],
  cancelled: []
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return allowedTaskTransitions[from].includes(to);
}

export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransitionTask(from, to)) {
    throw new Error(`invalid task transition: ${from} -> ${to}`);
  }
}
