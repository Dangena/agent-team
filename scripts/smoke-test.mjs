import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toBridgeUiEvents } from "../resources/lib/bridge-ui-events.mjs";
import { evaluateApprovalGate } from "../resources/lib/approval-gate.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const requiredFiles = [
  "package.json",
  "pnpm-workspace.yaml",
  "apps/desktop/package.json",
  "apps/desktop/electron.vite.config.ts",
  "apps/desktop/electron-builder.yml",
  "apps/desktop/src/main/main.ts",
  "apps/desktop/src/preload/index.ts",
  "apps/desktop/src/renderer/App.tsx",
  "docs/development-progress.md",
  "docs/implementation-handoff.md",
  "docs/opencodex-research.md",
  "scripts/fake-agent-flow.mjs",
  "packages/agent-team-core/src/index.ts",
  "packages/protocol/src/index.ts",
  "packages/protocol/src/fixtures.ts",
  "packages/platform/src/index.ts",
  "packages/persistence/src/index.ts",
  "packages/agent-host/src/index.ts",
  "packages/agent-host/src/index.test.ts",
  "packages/cli-adapters/src/index.ts",
  "packages/test-fixtures/bin/fake-agent-cli.mjs",
  "resources/bin/agent-team-bridge.mjs",
  "resources/lib/bridge-json-store.mjs",
  "resources/lib/bridge-ui-events.mjs",
  "resources/lib/approval-gate.mjs",
  "scripts/approval-gate-smoke.mjs",
  "scripts/bridge-stress.mjs",
  "scripts/fix-node-pty-permissions.mjs"
];

for (const file of requiredFiles) {
  assert.ok(existsSync(join(root, file)), `missing ${file}`);
}

const read = (file) => readFileSync(join(root, file), "utf8");
assert.match(read("packages/agent-team-core/src/roles.ts"), /planner/);
assert.match(read("packages/platform/src/index.ts"), /windows/);
assert.match(read("packages/platform/src/index.ts"), /macos/);
assert.match(read("resources/bin/agent-team-bridge.mjs"), /inbox/);
assert.match(read("packages/cli-adapters/src/index.ts"), /detectAllBuiltInAdapters/);
assert.match(read("packages/cli-adapters/src/index.ts"), /zcode/);
assert.match(read("packages/cli-adapters/src/index.ts"), /diagnostics/);
assert.match(read("packages/protocol/src/fixtures.ts"), /protocolEventFixtures/);
assert.match(read("packages/protocol/src/fixtures.ts"), /evidenceDiffCapturedFixture/);
assert.match(read("packages/protocol/src/fixtures.ts"), /evidenceTestRecordedFixture/);
assert.match(read("packages/test-fixtures/bin/fake-agent-cli.mjs"), /act-once/);
assert.match(read("packages/test-fixtures/bin/fake-agent-cli.mjs"), /evidence.test_recorded/);
assert.match(read("packages/agent-host/src/index.ts"), /BridgeEventStore/);
assert.match(read("packages/agent-host/src/index.ts"), /createAgentProcessManager/);
assert.match(read("packages/agent-host/src/index.ts"), /createAgentPtyManager/);
assert.match(read("packages/agent-host/src/index.ts"), /createBridgeTransportServer/);
assert.match(read("packages/persistence/src/index.ts"), /journal_mode = WAL/);
assert.match(read("resources/lib/bridge-json-store.mjs"), /listInboxEvents/);
assert.match(read("resources/lib/bridge-ui-events.mjs"), /toBridgeUiEvents/);
assert.match(read("resources/lib/approval-gate.mjs"), /evaluateApprovalGate/);
assert.match(read("resources/bin/agent-team-bridge.mjs"), /readBridgeJsonStore/);
assert.match(read("apps/desktop/src/renderer/App.tsx"), /todoItems/);
assert.match(read("apps/desktop/src/renderer/App.tsx"), /eventMessageClass/);
assert.match(read("apps/desktop/src/renderer/App.tsx"), /cliDetections/);
assert.match(read("apps/desktop/src/renderer/App.tsx"), /CLI 检测/);
assert.match(read("apps/desktop/src/renderer/App.tsx"), /尚未创建 CLI 窗口/);
assert.match(read("apps/desktop/src/renderer/App.tsx"), /创建 CLI 窗口/);
assert.doesNotMatch(read("apps/desktop/src/renderer/App.tsx"), /Fake 预览/);
assert.doesNotMatch(read("apps/desktop/src/renderer/App.tsx"), /className="traffic"/);
assert.doesNotMatch(read("apps/desktop/src/renderer/App.tsx"), /bridge online|设置已打开|rawBridgeEventFixtures/);
assert.match(read("apps/desktop/src/renderer/App.tsx"), /status-dot.*status\.tone/);
assert.match(read("apps/desktop/src/main/main.ts"), /desktopCliEnvironment/);
assert.match(read("apps/desktop/src/main/main.ts"), /\/opt\/homebrew\/bin/);
assert.match(read("apps/desktop/src/renderer/styles.css"), /scrollbar-color/);
assert.match(read("apps/desktop/src/renderer/styles.css"), /height: 100vh/);
assert.match(read("apps/desktop/src/renderer/styles.css"), /-webkit-app-region: drag/);
assert.match(read("apps/desktop/prototype/index.html"), /cliDetections/);
assert.match(read("apps/desktop/prototype/index.html"), /rawBridgeEventFixtures/);
assert.match(read("apps/desktop/prototype/index.html"), /toBridgeUiEvents/);
assert.match(read("apps/desktop/prototype/index.html"), /renderInbox/);
assert.match(read("apps/desktop/prototype/index.html"), /field-hint/);
assert.doesNotMatch(read("apps/desktop/src/renderer/App.tsx"), /add-todo|checkbox|Todo 已添加/);
assert.match(read("docs/development-progress.md"), /内部预览 MVP 已完成/);
assert.match(read("docs/implementation-handoff.md"), /Implementation Handoff/);
assert.match(read("docs/opencodex-research.md"), /Remote Gateway/);
assert.match(read("docs/opencodex-research.md"), /AGPL-3\.0/);
assert.match(read("apps/desktop/package.json"), /electron-vite/);
assert.match(read("apps/desktop/src/main/main.ts"), /new BrowserWindow/);
assert.match(read("apps/desktop/src/preload/index.ts"), /contextBridge\.exposeInMainWorld/);
assert.match(read("apps/desktop/src/preload/index.ts"), /onAgentProcessEvent/);
assert.match(read("apps/desktop/src/preload/index.ts"), /writeTerminal/);
assert.match(read("apps/desktop/electron-builder.yml"), /nsis/);

const bridgeBin = join(root, "resources/bin/agent-team-bridge.mjs");
const bridgeStore = join(mkdtempSync(join(tmpdir(), "agent-team-bridge-")), "store.json");
const baseBridgeEnv = {
  ...process.env,
  AGENT_TEAM_SESSION_ID: "ses_smoke",
  AGENT_TEAM_AGENT_ID: "planner",
  AGENT_TEAM_ROLE: "planner",
  AGENT_TEAM_BRIDGE_STORE: bridgeStore
};

function runBridge(args, env = baseBridgeEnv) {
  return JSON.parse(
    execFileSync(process.execPath, [bridgeBin, ...args], {
      cwd: root,
      env,
      encoding: "utf8"
    })
  );
}

const sent = runBridge([
  "send",
  "--type",
  "task.assigned",
  "--to",
  "executor",
  "--task",
  "task_smoke",
  "--payload",
  "{\"objective\":\"smoke\"}"
]);
assert.equal(sent.ok, true);
assert.match(sent.event.eventId, /^evt_/);

const plannerInbox = runBridge(["inbox"]);
assert.equal(plannerInbox.events.length, 0);

const executorInbox = runBridge(["inbox"], {
  ...baseBridgeEnv,
  AGENT_TEAM_AGENT_ID: "executor",
  AGENT_TEAM_ROLE: "executor"
});
assert.equal(executorInbox.events.length, 1);
assert.equal(executorInbox.events[0].eventId, sent.event.eventId);

const ack = runBridge(["ack", sent.event.eventId], {
  ...baseBridgeEnv,
  AGENT_TEAM_AGENT_ID: "executor",
  AGENT_TEAM_ROLE: "executor"
});
assert.equal(ack.acked, true);

const fakeFlow = JSON.parse(
  execFileSync(process.execPath, [join(root, "scripts/fake-agent-flow.mjs")], {
    cwd: root,
    encoding: "utf8"
  })
);
assert.equal(fakeFlow.ok, true);
assert.equal(fakeFlow.eventCount, 7);
assert.equal(fakeFlow.ackCount, 6);

const fakeStore = JSON.parse(readFileSync(fakeFlow.storePath, "utf8"));
const uiEvents = toBridgeUiEvents(fakeStore.events, fakeStore.acks);
assert.equal(uiEvents.length, 7);
assert.equal(uiEvents[0].status, "acked");
assert.equal(uiEvents.at(-1).type, "approval.granted");
assert.equal(uiEvents.at(-1).status, "queued");

const gate = evaluateApprovalGate({
  diffViewed: true,
  completionReport: {
    taskId: "task_smoke",
    changed: ["resources/lib/approval-gate.mjs"],
    tests: [{ command: "node scripts/smoke-test.mjs", cwd: ".", exitCode: 0 }],
    risks: []
  },
  findings: []
});
assert.equal(gate.ok, true);

const gateScript = JSON.parse(
  execFileSync(process.execPath, [join(root, "scripts/approval-gate-smoke.mjs")], {
    cwd: root,
    encoding: "utf8"
  })
);
assert.equal(gateScript.ok, true);

console.log("smoke test passed");
