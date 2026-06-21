import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDesktopRepository } from "./index";

describe("desktop repository", () => {
  it("persists workspaces, sessions and idempotent events", () => {
    const repository = createDesktopRepository(join(mkdtempSync(join(tmpdir(), "agent-team-db-")), "app.db"));
    const now = new Date().toISOString();
    repository.upsertWorkspace({ id: "ws_1", path: "/tmp/project", name: "project", branch: "main", dirty: false, available: true, lastOpenedAt: now });
    repository.saveSession({ id: "ses_1", workspaceId: "ws_1", title: "Session", status: "running", createdAt: now, updatedAt: now });
    const event = { eventId: "evt_1", sessionId: "ses_1", type: "session.started", payload: { ok: true }, createdAt: now };
    expect(repository.appendEvent(event)).toBe(true);
    expect(repository.appendEvent(event)).toBe(false);
    expect(repository.listWorkspaces()).toHaveLength(1);
    expect(repository.listSessions("ws_1")).toMatchObject([{ status: "running" }]);
    expect(repository.listEvents("ses_1")).toMatchObject([{ eventId: "evt_1", payload: { ok: true } }]);
    repository.close();
  });
});
