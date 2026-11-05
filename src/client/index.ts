/**
 * Browser half of dsh-sport-health.
 *
 * Registers one chart card per sport-health MCP tool and a standalone
 * "运动健康" conversation view. Vue, Element Plus and ECharts are bundled with
 * the client; only the Harness `slots` service is required.
 */
import SportHealthToolCard from './components/ToolCard.vue'
import SportHealthDashboard from './components/Dashboard.vue'
import { createSlotComponent } from './lib/mount.ts'
import { TOOL_NAMES, TOOL_VIEW_KEYS } from './lib/payload.ts'

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
