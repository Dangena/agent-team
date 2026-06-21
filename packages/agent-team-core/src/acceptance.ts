import type { CompletionReport } from "./tasks";

export type ReviewFindingSeverity = "blocker" | "high" | "medium" | "low";

export type ReviewFinding = {
  id: string;
  severity: ReviewFindingSeverity;
  file?: string;
  line?: number;
  title: string;
  resolved: boolean;
};

export type ApprovalGateInput = {
  diffViewed: boolean;
  completionReport?: CompletionReport;
  findings: ReviewFinding[];
  waiverReason?: string;
};

export type ApprovalGateResult = {
  ok: boolean;
  reasons: string[];
};

export function evaluateApprovalGate(input: ApprovalGateInput): ApprovalGateResult {
  const reasons: string[] = [];
  if (!input.diffViewed) {
    reasons.push("diff has not been viewed");
  }
  if (!input.completionReport) {
    reasons.push("completion report is missing");
  } else if (input.completionReport.tests.length === 0 && !input.waiverReason) {
    reasons.push("test evidence or waiver is required");
  }

  const unresolvedHighFindings = input.findings.filter(
    (finding) => !finding.resolved && ["blocker", "high"].includes(finding.severity)
  );
  if (unresolvedHighFindings.length > 0 && !input.waiverReason) {
    reasons.push("blocker/high review findings remain unresolved");
  }

  return {
    ok: reasons.length === 0,
    reasons
  };
}
