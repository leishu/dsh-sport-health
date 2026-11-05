/** Payload parsing and card metadata shared by the tool cards. */

export const SERVER_NAME = 'sport_health'

export const TOOL_NAMES = [
  'classify_run', 'compare_runs', 'describe_data_source', 'get_best_efforts',
  'get_consistency', 'get_daily_running', 'get_elevation_profile',
  'get_personal_bests', 'get_run_detail', 'get_run_route', 'get_run_splits',
  'get_running_summary', 'get_stop_points', 'get_training_load',
  'get_training_mix', 'get_training_trend', 'get_weather_impact', 'list_runs',
  'predict_race_time', 'reload_data',
] as const

export const TOOL_VIEW_KEYS = TOOL_NAMES.map(tool => `mcp__${SERVER_NAME}__${tool}`)

export const TITLES: Record<string, string> = {
  classify_run: '跑步类型判定',
  compare_runs: '两次跑步对比',
  describe_data_source: '数据源概况',
  get_best_efforts: '最佳分段',
  get_consistency: '训练连续性',
  get_daily_running: '每日跑量',
  get_elevation_profile: '海拔剖面',
  get_personal_bests: '个人最佳',
  get_run_detail: '跑步详情',
  get_run_route: 'GPS 轨迹',
  get_run_splits: '分段配速',
  get_running_summary: '跑步总览',
  get_stop_points: '停留点',
  get_training_load: '训练负荷',
  get_training_mix: '训练类型构成',
  get_training_trend: '训练趋势',
  get_weather_impact: '天气影响',
  list_runs: '跑步记录',
  predict_race_time: '比赛成绩预测',
  reload_data: '数据同步',
}

export const ICONS: Record<string, string> = {
  classify_run: '🏷️', compare_runs: '⚖️', describe_data_source: '🗂️', get_best_efforts: '⚡',
  get_consistency: '🔥', get_daily_running: '📅', get_elevation_profile: '⛰️',
  get_personal_bests: '🏆', get_run_detail: '🏃', get_run_route: '🗺️',
  get_run_splits: '📊', get_running_summary: '📈', get_stop_points: '⏸️',
  get_training_load: '🧮', get_training_mix: '🥧', get_training_trend: '📉',
  get_weather_impact: '🌤️', list_runs: '📋', predict_race_time: '⏱️', reload_data: '🔄',
}

/** Result payload plus the textual fallback the MCP bridge recorded. */
export interface ParsedPayload {
  value?: any
  text?: string
}

export function parsePayload(block: any): ParsedPayload {
  const content = block?.content
  if (!Array.isArray(content)) return {}
  const text = content
    .filter((item: any) => item?.type === 'text')
    .map((item: any) => String(item.text ?? ''))
    .join('\n')
    .trim()
  if (text === '') return {}
  try {
    return { value: JSON.parse(text), text }
  } catch {
    return { text }
  }
}

/** `mcp__sport_health__list_runs` → `list_runs`. */
export function rawName(toolName: string): string {
  const parts = toolName.split('__')
  return parts.length >= 3 ? parts.slice(2).join('__') : toolName
}

export function rangeOf(payload: any): string | undefined {
  return typeof payload?.range === 'string' ? payload.range : undefined
}

export function subtitleFor(name: string, payload: any): string | undefined {
  if (payload?.runId) {
    const date = payload?.date ? ` · ${payload.date}` : ''
    return `${payload.runId}${date}`
  }
  if (rangeOf(payload)) return rangeOf(payload)
  if (payload?.period) return `周期：${payload.period} × ${payload.count ?? ''}`
  if (payload?.anchorDate) return `截至 ${payload.anchorDate}`
  if (payload?.date) return String(payload.date)
  if (name === 'list_runs' && Array.isArray(payload?.runs)) return `共 ${payload.total ?? payload.runs.length} 条`
  return undefined
}

/** Splits `"2026-10-25 ~ 2026-11-04"` into its two ends. */
export function splitRange(range?: string): [string | undefined, string | undefined] {
  if (typeof range !== 'string') return [undefined, undefined]
  const [from, to] = range.split('~').map(part => part.trim())
  return [from || undefined, to || undefined]
}
