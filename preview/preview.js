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
    /**
     * 与 shell 契约一致的 React 测试替身。
     *
     * 真实渲染器按 `jsx(Comp, props)` 挂载 slot 条目，并要求组件返回 React
     * 元素。按这条路径渲染，桥接层若出错（比如又直接返回 DOM 节点）在预览里
     * 也能立刻暴露，而不是等到运行时白屏。
     */
    const reactShim = {
      createElement(type, props, ...children) {
        return { type, props: { ...props, children } }
      },
      useRef(initial) { return { current: initial } },
      useEffect(effect) { (pendingEffects ?? []).push(effect) },
    }
    let pendingEffects = null

    // 和 shell 一样：React 只能通过 factory 的 require 拿到，`apply(ctx)` 的
    // ctx 里没有 require。物化阶段的 require 由插件在模块顶层调用。
    const out = registration.factory(specifier => {
      if (specifier === 'react') return reactShim
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

    /**
     * 按渲染器的方式挂载：组件返回 React 元素 → 物化进 DOM → 执行 useEffect。
     */
    function renderReact(Comp, props, host) {
      pendingEffects = []
      const tree = reactShim.createElement(Comp, props)
      if (typeof tree.type === 'function') placeElement(tree.type(tree.props ?? {}), host)
      else placeElement(tree, host)

      const cleanups = []
      const effects = pendingEffects
      pendingEffects = null
      for (const effect of effects) {
        const cleanup = effect()
        if (typeof cleanup === 'function') cleanups.push(cleanup)
      }
      return { destroy() { for (const cleanup of cleanups.splice(0)) cleanup() } }
    }

    function placeElement(element, parent) {
      if (element === null || element === undefined) return null
      if (typeof element === 'string' || typeof element === 'number') {
        const text = document.createTextNode(String(element))
        parent.appendChild(text)
        return text
      }
      if (typeof element.type === 'function') return placeElement(element.type(element.props ?? {}), parent)

      const node = document.createElement(element.type)
      const props = element.props ?? {}
      for (const [key, value] of Object.entries(props)) {
        if (key === 'children' || value === undefined) continue
        if (key === 'ref') { value.current = node; continue }
        if (key === 'className') node.className = value
        else if (key === 'style' && value && typeof value === 'object') Object.assign(node.style, value)
        else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value)
        else node.setAttribute(key, String(value))
      }
      for (const child of props.children ?? []) placeElement(child, node)
      parent.appendChild(node)
      return node
    }

    /** Mounts a slot component into a wrapper element and keeps it for teardown. */
    function mountCell(container, Host, props) {
      const view = renderReact(Host, props, container)
      live.push(view)
      return view
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
