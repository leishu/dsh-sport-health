/**
 * Development-only preview of the Vue tool cards and the dashboard view.
 *
 * `index.html` installs a `window.__ModuleLoader__` shim that stores the bundle
 * registration on `window.__SPORT_HEALTH_REGISTRATION__`; the bundle script
 * runs before this file, so the registration is normally already available.
 * The polling fallback keeps the preview working if the script order changes.
 */
(function () {
  /** Resolves once the bundle has registered itself. */
  function ready() {
    return new Promise((resolve, reject) => {
      const started = Date.now()
      const timer = setInterval(() => {
        const registration = window.__SPORT_HEALTH_REGISTRATION__
        if (registration) {
          clearInterval(timer)
          resolve(registration)
        } else if (Date.now() - started > 5000) {
          clearInterval(timer)
          reject(new Error('client bundle did not register; run `npm run build` first'))
        }
      }, 20)
    })
  }

  ready().then(boot).catch(error => {
    const root = document.getElementById('root')
    if (root) root.textContent = error.message
    console.error(error)
  })

  function boot(registration) {
    const out = registration.factory(specifier => {
      throw new Error('unexpected client dependency: ' + specifier)
    })

    const toolviews = new Map()
    let Dashboard
    const ctx = {
      slots: {
        inject(_name, callback) {
          const result = callback()
          if (result && typeof result[Symbol.iterator] === 'function') for (const disposer of result) void disposer
        },
        register(options, component) {
          if (options.name === 'tool.call.toolview') toolviews.set(options.key, component)
          if (options.name === 'conversation.view') Dashboard = component
          return () => {}
        },
      },
      logger: { info() {}, warn() {} },
    }
    out.apply(ctx)

    const tools = Array.from(toolviews.keys()).map(key => ({ key, name: key.split('__').slice(2).join('__') }))

    const originalFetch = window.fetch.bind(window)
    let overview = null
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.url
      if (url.includes('/sport-health/api/overview')) {
        if (!overview) throw new Error('overview fixture is not loaded')
        return new Response(JSON.stringify(overview), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return originalFetch(input, init)
    }

    const root = document.getElementById('root')
    let mode = 'cards'
    let theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    document.body.dataset.theme = theme

    let live = []

    function clear() {
      for (const instance of live) instance.destroy()
      live = []
      root.replaceChildren()
    }

    /** Mounts a slot host into a wrapper element and keeps it for teardown. */
    function mountCell(container, Host, props) {
      const instance = Host()
      const element = instance.render()
      instance.setProps(props)
      live.push(instance)
      if (element) container.appendChild(element)
      return instance
    }

    async function renderCards() {
      const grid = document.createElement('div')
      grid.className = 'grid'
      root.replaceChildren(grid)
      await Promise.all(tools.map(async tool => {
        const cell = document.createElement('div')
        cell.className = 'cell'
        const label = document.createElement('div')
        label.className = 'name'
        label.textContent = tool.name
        cell.appendChild(label)
        grid.appendChild(cell)
        try {
          const response = await originalFetch(`../tests/fixtures/sport-${tool.name}.json`)
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const payload = await response.json()
          mountCell(cell, toolviews.get(tool.key), {
            toolName: `mcp__sport_health__${tool.name}`,
            phase: 'result',
            block: { content: [{ type: 'text', text: JSON.stringify(payload) }], isError: false },
          })
        } catch (error) {
          label.textContent = `${tool.name} · 读取 fixture 失败：${error.message}`
        }
      }))
    }

    function renderDashboard() {
      const wrapper = document.createElement('div')
      wrapper.className = 'dashboard'
      root.replaceChildren(wrapper)
      if (!Dashboard) {
        wrapper.textContent = '仪表盘视图未注册'
        return
      }
      mountCell(wrapper, Dashboard, {})
    }

    function render() {
      clear()
      if (mode === 'cards') void renderCards()
      else renderDashboard()
    }

    function renderToolbar() {
      const bar = document.getElementById('toolbar')
      const options = [
        ['cards', `全部图表（${tools.length}）`],
        ['dashboard', '运动健康视图'],
      ]
      const nodes = options.map(([value, label]) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = label
        button.setAttribute('aria-pressed', String(mode === value))
        button.addEventListener('click', () => {
          mode = value
          renderToolbar()
          render()
        })
        return button
      })

      const spacer = document.createElement('span')
      spacer.className = 'spacer'

      const themeButton = document.createElement('button')
      themeButton.type = 'button'
      themeButton.textContent = theme === 'dark' ? '切换到浅色' : '切换到深色'
      themeButton.addEventListener('click', () => {
        theme = theme === 'dark' ? 'light' : 'dark'
        document.body.dataset.theme = theme
        renderToolbar()
        render()
      })

      bar.replaceChildren(...nodes, spacer, themeButton)
    }

    fetch('../tests/fixtures/api-overview.json')
      .then(response => response.json())
      .then(payload => { overview = payload })
      .catch(() => {})

    renderToolbar()
    render()
  }
})()
