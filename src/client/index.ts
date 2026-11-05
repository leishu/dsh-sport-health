/**
 * Browser half of dsh-sport-health.
 *
 * Registers one chart card per sport-health MCP tool and a standalone
 * "运动健康" conversation view. Vue, Element Plus and ECharts are bundled with
 * the client; only the Harness `slots` service is required.
 *
 * 注册进 slot 的不是 Vue 组件，而是 `lib/mount.ts` 生成的 **React 桥接组件**：
 * 它渲染一个空 `<div>`，在 `useEffect` 里 `createApp().mount()` 把 Vue 挂进去。
 * 详见 `lib/mount.ts` 顶部说明。
 */
import SportHealthToolCard from './components/ToolCard.vue'
import SportHealthDashboard from './components/Dashboard.vue'
import { captureShellReact, createSlotComponent } from './lib/mount.ts'
import { TOOL_NAMES, TOOL_VIEW_KEYS } from './lib/payload.ts'

/**
 * 捕获宿主的 React。
 *
 * Vite 把本文件的模块体整体塞进 `factory(require)` 里执行，而那个 `require`
 * 只在物化阶段有效 —— `apply()` 跑的时候早就失效了（`ctx` 不会注入它）。
 * 所以必须在模块顶层同步调用，这是唯一能拿到宿主 React 的时机。
 * `require` 本身由打包器注入成 `__dsh_require__`，见 `vite.config.ts`。
 */
captureShellReact()

export const name = 'dsh-sport-health'

export const inject = ['slots']

export { TOOL_NAMES, TOOL_VIEW_KEYS }

interface SlotsService {
  inject(name: string, callback: () => (() => void) | Iterable<() => void>): void
  register(options: Record<string, unknown>, component: unknown): () => void
}

interface ClientContext {
  slots: SlotsService
  logger?: {
    info(...args: unknown[]): void
    warn(...args: unknown[]): void
  }
}

/** React 桥接组件：外层是空容器，内部由 Vue 接管。 */
export const SportHealthToolView = createSlotComponent(SportHealthToolCard)
export const SportHealthView = createSlotComponent(SportHealthDashboard)

export function apply(ctx: ClientContext): void {
  // `slots.inject` waits until the owning Tool call-tree has declared the
  // keyed slot, so load order between our bundle and ui-tool does not matter.
  ctx.slots.inject('tool.call.toolview', function* () {
    for (const key of TOOL_VIEW_KEYS) {
      yield ctx.slots.register({ name: 'tool.call.toolview', key }, SportHealthToolView)
    }
  })

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'sport-health',
    order: 20,
    label: () => '运动健康',
  }, SportHealthView))

  ctx.logger?.info('sport-health: registered %d chart toolviews and the dashboard view', TOOL_VIEW_KEYS.length)
}
