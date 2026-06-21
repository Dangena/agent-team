# UI Prototype Notes

## Design Direction

The current prototype follows a quiet desktop-agent workspace direction inspired by Codex/Zcode:

- Left rail uses a soft local-first surface, compact nav actions, project cards, per-project menus,
  and per-project conversations.
- Main session header is intentionally short so terminal work has priority.
- Agent windows are the primary work surface; secondary controls stay in the right rail.
- Agent team configuration is progressive: visible while editing, collapsed after creating windows.
- Todo List is an automatic status surface inferred from the current conversation and team state.
- Bridge Inbox remains visible as the structured message surface.

## Flow Closure

The zero-install prototype keeps these flows reachable:

- Add project from the left rail.
- Start a new conversation globally or inside a project.
- Open project menu, switch project, or create a project conversation.
- Edit the Agent team after the setup panel collapses.
- Create 1, 2, or 3 Agent windows from detected CLI choices:
  - 1 = executor
  - 2 = planner/reviewer + executor
  - 3 = planner + executor + reviewer
- Continue execution through automatic Todo List and Bridge Inbox.

## Current Source Files

- Static baseline: `apps/desktop/prototype/index.html`
- React draft: `apps/desktop/src/renderer/App.tsx`
- Renderer styles: `apps/desktop/src/renderer/styles.css`

The static prototype is currently the browser-viewable source. The React draft mirrors it for the
future Electron/Vite app but is not compiled until dependencies are approved.

## Framework Candidates

When dependency installation is approved, use:

- shadcn/ui for component source patterns.
- Radix Primitives for accessible select, dropdown, collapsible, tooltip, and dialog behavior.
- react-resizable-panels for terminal layout resizing.
- xterm.js for terminal rendering.

No packages are installed in the current zero-install prototype.
