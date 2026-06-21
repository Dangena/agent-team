export function evaluateApprovalGate(input) {
  const reasons = [];

  if (!input.diffViewed) {
    reasons.push("diff has not been viewed");
  }

  if (!input.completionReport) {
    reasons.push("completion report is missing");
  } else if ((!input.completionReport.tests || input.completionReport.tests.length === 0) && !input.waiverReason) {
    reasons.push("test evidence or waiver is required");
  }

  const findings = Array.isArray(input.findings) ? input.findings : [];
  const unresolvedHighFindings = findings.filter(
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
