# Dependency Roadmap

Dependency installation was approved on 2026-06-21. Electron, React, Vite, TypeScript and the
electron-vite development toolchain are now installed through the pnpm workspace.

When the project moves from scaffold/prototype to runnable Electron app, the expected dependencies
are:

- Installed runtime: `electron`, `react`, `react-dom`
- Installed build/dev: `electron-vite`, `typescript`, `vite`, `@vitejs/plugin-react`
- Installed types: `@types/node`, `@types/react`, `@types/react-dom`
- Next UI/runtime: `xterm.js`, `vitest`
- Later native runtime: `node-pty`, SQLite binding
- Later optional remote gateway: WebSocket server library, HTTP router, password hashing helper

## UI framework candidates

Keep the visual direction close to Codex/Zcode: quiet sidebar, compact session bar, resizable agent
workspace, collapsible configuration panel, and evidence/task surfaces that stay out of the way.

Recommended open-source candidates when dependency installation is approved:

- `shadcn/ui`: component source distribution with good defaults; useful for sidebar, button, select,
  dropdown, sheet, tooltip, resizable, and command surfaces.
- `Radix Primitives`: accessible low-level primitives for select, dialog, dropdown, tabs, tooltip,
  checkbox, and collapsible behavior.
- `react-resizable-panels`: split panes for agent terminal layouts and side panels.
- `xterm.js`: terminal surface inside each agent window.

Do not add these packages until the user explicitly approves dependency installation.

## Remote gateway candidates

OpenCodex shows a useful pattern for a separate launcher/gateway, but this project should not copy
its AGPL implementation. When dependency installation is approved, evaluate small, well-maintained
building blocks for an optional Remote Gateway:

- HTTP/WebSocket transport for authenticated session state and terminal streams.
- In-memory short-lived auth tokens with password-hash storage.
- Local-file preview URLs protected by allowlists or short-lived tokens.
- Sanitized diagnostics that never include prompt text, secrets, or full file contents.

Remote Gateway remains out of the zero-install MVP.

For now, keep implementation work inside this folder and validate with:

```bash
node scripts/smoke-test.mjs
node resources/bin/agent-team-bridge.mjs --help
node packages/test-fixtures/bin/fake-agent-cli.mjs --role planner --once
```
