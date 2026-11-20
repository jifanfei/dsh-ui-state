/**
 * dsh-ui-state, Host half: collect UI snapshots reported by the browser and
 * expose them to the agent as one read-only tool.
 *
 * The tool definition is built by hand on purpose: this bundle is installed
 * from a directory outside the profile, so it must not import dsh packages.
 */
export const name = 'dsh-ui-state'
export const inject = ['tools', 'webServer', 'connection']

const ROUTE = '/ui-state/api'

/** @param {import('@deepseek-ai/cordis').Context} ctx */
export function apply(ctx) {
  /** @type {Map<string, {receivedAt:number, value:unknown}>} */
  const windows = new Map()

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE,
    handler: async (req, res) => {
      const rejection = ctx.connection.requestRejection(req)
      if (rejection !== undefined) {
        res.writeHead(rejection, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }))
        return
      }
      const url = new URL(req.url ?? '/', 'http://dsh.local')
      if (url.pathname.endsWith('/report')) {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ ok: false, error: 'POST required' }))
          return
        }
        let body = ''
        try {
          for await (const chunk of req) body += chunk
          const value = JSON.parse(body || '{}')
          const windowId = String(value && value.windowId ? value.windowId : 'unknown')
          windows.set(windowId, { receivedAt: Date.now(), value })
        } catch {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ ok: false, error: 'invalid json' }))
          return
        }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ ok: true }))
        return
      }
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: 'not found' }))
    },
  }), 'dsh-ui-state: routes')

  ctx.tools.register({
    name: 'ui_state',
    description: 'Read the current Web UI state reported by the open browser windows: which surface has keyboard focus (unique), the open right-sidebar tabs, the active tab, and the layout panel. Read-only; snapshots are pushed by the browser, so ageMs tells you how fresh each one is.',
    parameters: { type: 'object', properties: {} },
    output: {
      schema: {
        type: 'object',
        properties: { windows: { type: 'string' } },
        required: ['windows'],
      },
      render: (_args, value) => [{ type: 'text', text: value.windows }],
    },
    async execute() {
      const now = Date.now()
      const list = [...windows.entries()].map(([windowId, record]) => {
        const value = record.value && typeof record.value === 'object' ? record.value : { value: record.value }
        // Fill each pane tab's address from the sidebar inventory (it carries the
        // contentId per tabId); the layout record itself does not.
        const inventory = Array.isArray(value.openTabs) ? value.openTabs : []
        const addressOf = (tabId) => {
          const entry = inventory.find((item) => item && item.tabId === tabId)
          return entry && entry.contentId ? entry.contentId : null
        }
        const panes = Array.isArray(value.panes)
          ? value.panes.map((pane) => ({
            ...pane,
            tabs: Array.isArray(pane.tabs)
              ? pane.tabs.map((tab) => ({ ...tab, address: tab.address || addressOf(tab.tabId) }))
              : pane.tabs,
          }))
          : value.panes
        return { windowId, ageMs: now - record.receivedAt, ...value, panes }
      })
      return { windows: JSON.stringify(list, null, 2) }
    },
  })
}