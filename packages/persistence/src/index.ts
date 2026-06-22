import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type WorkspaceRecord = {
  id: string;
  path: string;
  name: string;
  branch: string | null;
  dirty: boolean;
  available: boolean;
  lastOpenedAt: string;
};

export type SessionRecord = {
  id: string;
  workspaceId: string;
  title: string;
  status: "draft" | "running" | "paused" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
};

export type PersistedEvent = {
  eventId: string;
  sessionId: string;
  type: string;
  payload: unknown;
  createdAt: string;
};

export type AppStateRecord<TValue = unknown> = {
  key: string;
  value: TValue;
  updatedAt: string;
};

export type DesktopRepository = {
  close(): void;
  listWorkspaces(): WorkspaceRecord[];
  upsertWorkspace(workspace: WorkspaceRecord): WorkspaceRecord;
  removeWorkspace(id: string): boolean;
  listSessions(workspaceId: string): SessionRecord[];
  saveSession(session: SessionRecord): SessionRecord;
  appendEvent(event: PersistedEvent): boolean;
  listEvents(sessionId: string): PersistedEvent[];
  getAppState<TValue = unknown>(key: string): AppStateRecord<TValue> | null;
  saveAppState<TValue = unknown>(state: AppStateRecord<TValue>): AppStateRecord<TValue>;
};

export function createDesktopRepository(databasePath: string): DesktopRepository {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      branch TEXT,
      dirty INTEGER NOT NULL DEFAULT 0,
      available INTEGER NOT NULL DEFAULT 1,
      last_opened_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      event_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_session_created_idx ON events(session_id, created_at);
    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      task_id TEXT,
      kind TEXT NOT NULL,
      summary TEXT NOT NULL,
      artifact_path TEXT,
      sha256 TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_entries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  return {
    close() {
      database.close();
    },
    listWorkspaces() {
      const rows = database.prepare(`
        SELECT id, path, name, branch, dirty, available, last_opened_at
        FROM workspaces ORDER BY last_opened_at DESC
      `).all() as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        id: String(row.id),
        path: String(row.path),
        name: String(row.name),
        branch: row.branch === null ? null : String(row.branch),
        dirty: Boolean(row.dirty),
        available: Boolean(row.available),
        lastOpenedAt: String(row.last_opened_at)
      }));
    },
    upsertWorkspace(workspace) {
      database.prepare(`
        INSERT INTO workspaces (id, path, name, branch, dirty, available, last_opened_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET
          name = excluded.name,
          branch = excluded.branch,
          dirty = excluded.dirty,
          available = excluded.available,
          last_opened_at = excluded.last_opened_at
      `).run(
        workspace.id,
        workspace.path,
        workspace.name,
        workspace.branch,
        workspace.dirty ? 1 : 0,
        workspace.available ? 1 : 0,
        workspace.lastOpenedAt
      );
      return this.listWorkspaces().find((item) => item.path === workspace.path) ?? workspace;
    },
    removeWorkspace(id) {
      return database.prepare("DELETE FROM workspaces WHERE id = ?").run(id).changes > 0;
    },
    listSessions(workspaceId) {
      return database.prepare(`
        SELECT id, workspace_id AS workspaceId, title, status,
               created_at AS createdAt, updated_at AS updatedAt
        FROM sessions WHERE workspace_id = ? ORDER BY updated_at DESC
      `).all(workspaceId) as unknown as SessionRecord[];
    },
    saveSession(session) {
      database.prepare(`
        INSERT INTO sessions (id, workspace_id, title, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET title = excluded.title,
          status = excluded.status, updated_at = excluded.updated_at
      `).run(session.id, session.workspaceId, session.title, session.status, session.createdAt, session.updatedAt);
      return session;
    },
    appendEvent(event) {
      return database.prepare(`
        INSERT OR IGNORE INTO events (event_id, session_id, type, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(event.eventId, event.sessionId, event.type, JSON.stringify(event.payload), event.createdAt).changes > 0;
    },
    listEvents(sessionId) {
      const rows = database.prepare(`
        SELECT event_id, session_id, type, payload_json, created_at
        FROM events WHERE session_id = ? ORDER BY created_at, event_id
      `).all(sessionId) as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        eventId: String(row.event_id),
        sessionId: String(row.session_id),
        type: String(row.type),
        payload: JSON.parse(String(row.payload_json)) as unknown,
        createdAt: String(row.created_at)
      }));
    },
    getAppState(key) {
      const row = database.prepare(`
        SELECT key, value_json, updated_at FROM app_state WHERE key = ?
      `).get(key) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        key: String(row.key),
        value: JSON.parse(String(row.value_json)),
        updatedAt: String(row.updated_at)
      };
    },
    saveAppState(state) {
      database.prepare(`
        INSERT INTO app_state (key, value_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_at = excluded.updated_at
      `).run(state.key, JSON.stringify(state.value), state.updatedAt);
      return state;
    }
  };
}
