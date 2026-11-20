/**
 * dsh-ui-state, Client half: snapshot focus / sidebar panes / tabs / layout and
 * POST them to the Host. Read-only: it never drives the page.
 */
window.__ModuleLoader__.load({
  id: 'dsh-ui-state',
  factory() {
    const WINDOW_ID = (() => {
      try {
        let id = window.sessionStorage.getItem('dsh-ui-state.window')
        if (!id) {
          id = Math.random().toString(36).slice(2, 10)
          window.sessionStorage.setItem('dsh-ui-state.window', id)
        }
        return id
      } catch { return 'window' }
    })()

    const readSnapshot = (appCtx) => {
      const get = (name) => (appCtx && typeof appCtx.get === 'function' ? appCtx.get(name) : undefined)
      const sidebar = get('sidebarRight')
      const layout = get('layout')

      let mounted = null
      try {
        mounted = sidebar && sidebar.mounted && typeof sidebar.mounted.getSnapshot === 'function'
          ? sidebar.mounted.getSnapshot()
          : null
      } catch { mounted = null }

      let panes = null
      let expanded = null
      let layoutTabs = null
      try {
        const adopted = sidebar && sidebar.adopted
        const record = adopted && mounted && typeof adopted.get === 'function' ? adopted.get(mounted) : undefined
        const surface = record && record.store && typeof record.store.getSnapshot === 'function'
          ? record.store.getSnapshot().bySession[mounted]
          : undefined
        const state = surface && surface.layout
        if (state && state.nodes) {
          layoutTabs = state.tabs || null
          expanded = state.expanded === true
          panes = Object.values(state.nodes)
            .filter((node) => node && node.kind === 'pane')
            .map((pane) => {
              const described = (tabId) => {
                const record = tabId && layoutTabs ? layoutTabs[tabId] : null
                return {
                  tabId,
                  kind: record ? record.kind || null : null,
                  title: record ? record.title || null : null,
                  address: record && record.address ? String(record.address) : null,
                }
              }
              return {
                paneId: pane.id,
                host: pane.host,
                activeTabId: pane.activeTabId || null,
                activeTabKind: pane.activeTabId && layoutTabs && layoutTabs[pane.activeTabId] ? layoutTabs[pane.activeTabId].kind || null : null,
                activeTabTitle: pane.activeTabId && layoutTabs && layoutTabs[pane.activeTabId] ? layoutTabs[pane.activeTabId].title || null : null,
                tabs: (pane.tabs || []).map(described),
              }
            })
        }
      } catch { panes = null }

      let focus = null
      try {
        const active = document.activeElement
        if (active !== null && active !== undefined && active !== document.body) {
          const target = sidebar && typeof sidebar.focusedTarget === 'function' ? sidebar.focusedTarget(active) : undefined
          const slotElement = active.closest ? active.closest('[data-slot]') : null
          const tabId = target ? (target.tabId || (target.tab && target.tab.id) || null) : null
          focus = {
            slot: slotElement ? slotElement.getAttribute('data-slot') : null,
            tag: active.tagName ? String(active.tagName).toLowerCase() : null,
            id: active.id ? String(active.id) : null,
            contentEditable: active.isContentEditable === true,
            paneId: target ? (target.paneId || (target.panel && target.panel.id) || null) : null,
            tabId,
            kind: target && target.tab ? target.tab.kind || null
              : (tabId && layoutTabs && layoutTabs[tabId] ? layoutTabs[tabId].kind || null : null),
          }
        }
      } catch (error) {
        focus = { error: String((error && error.message) || error) }
      }

      let openTabs = null
      try {
        const source = sidebar && sidebar.openTabs
        openTabs = source && typeof source.getSnapshot === 'function' ? source.getSnapshot() : null
      } catch { openTabs = null }

      let activeTab = null
      try {
        activeTab = sidebar && typeof sidebar.active === 'function' ? sidebar.active() : null
      } catch { activeTab = null }

      let panel = null
      try {
        const info = layout && layout.panelInfo
        panel = info && typeof info.getSnapshot === 'function' ? info.getSnapshot() : null
      } catch { panel = null }

      return {
        windowId: WINDOW_ID, at: Date.now(), mounted, expanded,
        visibility: document.visibilityState || null,
        hasFocus: typeof document.hasFocus === 'function' ? document.hasFocus() : null,
        focus, panes, openTabs, activeTab, panel,
      }
    }

    return {
      inject: [],
      apply(ctx) {
        let timer = 0
        let lastJson = ''

        let lastPostAt = 0
        const flush = () => {
          timer = 0
          let payload
          try { payload = readSnapshot(ctx) } catch (error) { payload = { windowId: WINDOW_ID, error: String((error && error.message) || error) } }
          let json
          try { json = JSON.stringify(payload) } catch { return }
          const now = Date.now()
          /* 状态没变时也要定期心跳，否则 Host 侧的 ageMs 会无限增长 */
          if (json === lastJson && now - lastPostAt < 8000) return
          lastJson = json
          lastPostAt = now
          try {
            void fetch('/ui-state/api/report', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: json,
              credentials: 'same-origin',
              keepalive: true,
            }).catch(() => {})
          } catch { /* ignore */ }
        }
        const schedule = () => {
          if (timer !== 0) return
          timer = window.setTimeout(flush, 100)
        }
        const onEvent = () => schedule()

        document.addEventListener('focusin', onEvent, true)
        document.addEventListener('focusout', onEvent, true)
        document.addEventListener('click', onEvent, true)
        document.addEventListener('keydown', onEvent, true)
        document.addEventListener('input', onEvent, true)
        document.addEventListener('visibilitychange', onEvent, true)
        window.addEventListener('focus', onEvent, true)
        window.addEventListener('blur', onEvent, true)
        const interval = window.setInterval(schedule, 2000)

        ctx.effect(() => () => {
          document.removeEventListener('focusin', onEvent, true)
          document.removeEventListener('focusout', onEvent, true)
          document.removeEventListener('click', onEvent, true)
          document.removeEventListener('keydown', onEvent, true)
          document.removeEventListener('input', onEvent, true)
          document.removeEventListener('visibilitychange', onEvent, true)
          window.removeEventListener('focus', onEvent, true)
          window.removeEventListener('blur', onEvent, true)
          window.clearInterval(interval)
          if (timer !== 0) window.clearTimeout(timer)
        }, 'dsh-ui-state: listeners')

        schedule()
      },
    }
  },
})