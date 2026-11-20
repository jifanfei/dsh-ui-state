# UI state

A read-only bridge that lets the agent see where the Web UI is: which surface
holds keyboard focus (unique), the open sidebar panes with each pane's own
active tab, the tab inventory, and the global layout panel.

## What it does

- A Client plugin snapshots `document.activeElement`, the sidebar layout from
  the adopted store (panes, each pane's `activeTabId`, its tabs), the sidebar
  tab inventory and the layout panel. It flushes on focus/click changes
  (debounced 100 ms) and every 2 s as a fallback, then POSTs the snapshot to
  the Host.
- A Host plugin keeps the latest snapshot per browser window and registers the
  read-only `ui_state` tool.

## Usage

Ask the agent to call `ui_state`. It returns a JSON array, one entry per open
browser window:

- `focus` (unique): the keyboard focus - `slot`, `tag`, `paneId`, `tabId`,
  `kind`, or `null` when nothing outside the body is focused.
- `panes` (per pane): `paneId`, `host` (dock/float), `activeTabId`,
  `activeTabKind`, `activeTabTitle`, and the pane's `tabs`, each with
  `tabId`, `kind`, `title` and `address`.
- `openTabs` / `activeTab`: the sidebar tab inventory and the single active tab.
- `panel`: the global layout panel (`activePanelId`).
- `ageMs`: how stale the snapshot is.

Focus is one value for the whole window; `panes[].activeTabId` is per pane and
persists while focus is elsewhere. Do not derive one from the other.

## Limits

- The snapshot is push-based: a very recent interaction can be up to ~100 ms
  old, and `ageMs` reports staleness.
- Focus inside an embedded iframe resolves to its pane/tab, not an inner element.
- Multiple browser windows report independently; each has its own `windowId`.
- It reads the sidebar's adopted store, which is not part of the public
  controller contract; a DSH change to that store shape can drop `panes` (the
  rest of the snapshot keeps working).

## Configuration

None.