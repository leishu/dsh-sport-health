/**
 * Read-only dashboard snapshots assembled from sport-health MCP tools.
 *
 * Every endpoint degrades per tool: one failing call does not blank the whole
 * dashboard. The proxy never exposes arbitrary MCP names — only the handful
 * of endpoints defined here.
 */
import type { McpHttpClient } from './mcp.ts'

export interface SportHealthApiConfig {
  url: string
  timeoutMs: number
  cacheTtlMs: number
}

export interface ApiError {
  tool: string
  message: string
}

export function createSportHealthApi(client: McpHttpClient, config: SportHealthApiConfig) {
  const capture = async <T>(errors: ApiError[], tool: string, call: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await call()
    } catch (error) {
      errors.push({ tool, message: error instanceof Error ? error.message : String(error) })
      return undefined
    }
  }

  return {
    /** One snapshot for the standalone dashboard. */
    async overview(refresh = false): Promise<Record<string, unknown>> {
      if (refresh) client.clearCache()
      const errors: ApiError[] = []
      const [
        summary, daily, mix, consistency, load, bests, weather, runs, trend, predictions,
        sleepSummary, sleepTrend, recovery, vitals, hrv, stress, bloodOxygen,
        activity, activityMinutes, heartRate, bodyComposition, weeklyReport,
        medals, ecg, runLevel, dynamics, officialSplits,
      ] = await Promise.all([
        capture(errors, 'get_running_summary', () => client.callTool('get_running_summary')),
        capture(errors, 'get_daily_running', () => client.callTool('get_daily_running', { groupBy: 'day' })),
        capture(errors, 'get_training_mix', () => client.callTool('get_training_mix')),
        capture(errors, 'get_consistency', () => client.callTool('get_consistency')),
        capture(errors, 'get_training_load', () => client.callTool('get_training_load')),
        capture(errors, 'get_personal_bests', () => client.callTool('get_personal_bests', { category: 'all' })),
        capture(errors, 'get_weather_impact', () => client.callTool('get_weather_impact')),
        capture(errors, 'list_runs', () => client.callTool('list_runs', { limit: 20, sortBy: 'date' })),
        // Weekly rollup: the dashboard's "this week vs last week" strip reads
        // the last two periods from here instead of aggregating daily buckets.
        capture(errors, 'get_training_trend', () => client.callTool('get_training_trend', { period: 'week', count: 8 })),
        // Riegel projections for the race-time panel. No `distanceKm` asks for
        // the standard 5K / 10K / half / full ladder in one call.
        capture(errors, 'predict_race_time', () => client.callTool('predict_race_time')),
        // Health side of the dashboard (Huawei data). Every tool is called with
        // its defaults so it picks the server's latest window; run-scoped tools
        // (splits, route, ECG detail…) stay behind the per-run endpoint.
        capture(errors, 'get_sleep_summary', () => client.callTool('get_sleep_summary')),
        capture(errors, 'get_sleep_trend', () => client.callTool('get_sleep_trend')),
        capture(errors, 'get_recovery_status', () => client.callTool('get_recovery_status')),
        capture(errors, 'get_daily_vitals', () => client.callTool('get_daily_vitals')),
        capture(errors, 'get_hrv_trend', () => client.callTool('get_hrv_trend')),
        capture(errors, 'get_stress_series', () => client.callTool('get_stress_series')),
        capture(errors, 'get_blood_oxygen', () => client.callTool('get_blood_oxygen')),
        capture(errors, 'get_daily_activity', () => client.callTool('get_daily_activity')),
        capture(errors, 'get_activity_minutes', () => client.callTool('get_activity_minutes')),
        capture(errors, 'get_heart_rate_series', () => client.callTool('get_heart_rate_series')),
        // Without gender/height this returns the per-user config list plus an
        // explicit "cannot merge" warning — exactly what the dashboard shows.
        capture(errors, 'get_body_composition', () => client.callTool('get_body_composition')),
        capture(errors, 'get_weekly_health_report', () => client.callTool('get_weekly_health_report')),
        capture(errors, 'get_medals', () => client.callTool('get_medals', { limit: 20 })),
        capture(errors, 'get_ecg_records', () => client.callTool('get_ecg_records', { limit: 20 })),
        capture(errors, 'get_run_level', () => client.callTool('get_run_level', { includeHistory: true })),
        // No runId → range/aggregate mode; the fixture keeps one run but both
        // shapes are handled in the client.
        capture(errors, 'get_running_dynamics', () => client.callTool('get_running_dynamics')),
        capture(errors, 'get_official_splits', () => client.callTool('get_official_splits')),
      ])

      const available = [
        summary, daily, mix, consistency, load, bests, weather, runs, trend, predictions,
        sleepSummary, sleepTrend, recovery, vitals, hrv, stress, bloodOxygen,
        activity, activityMinutes, heartRate, bodyComposition, weeklyReport,
        medals, ecg, runLevel, dynamics, officialSplits,
      ].filter(value => value !== undefined)
      return {
        ok: available.length > 0,
        url: config.url,
        generatedAt: nowText(),
        summary,
        daily,
        mix,
        consistency,
        load,
        bests,
        weather,
        runs,
        trend,
        predictions,
        sleepSummary,
        sleepTrend,
        recovery,
        vitals,
        hrv,
        stress,
        bloodOxygen,
        activity,
        activityMinutes,
        heartRate,
        bodyComposition,
        weeklyReport,
        medals,
        ecg,
        runLevel,
        dynamics,
        officialSplits,
        errors,
        ...(available.length === 0 ? { error: errors[0]?.message ?? '无法连接 sport-health MCP 服务' } : {}),
      }
    },

    /** Paged run list. */
    async runs(query: URLSearchParams): Promise<unknown> {
      const limit = clampNumber(query.get('limit'), 1, 200, 20)
      const offset = clampNumber(query.get('offset'), 0, 100_000, 0)
      const sortBy = query.get('sortBy')
      const allowedSort = ['date', 'distance', 'duration', 'pace', 'climb']
      const args: Record<string, unknown> = { limit, offset }
      if (sortBy !== null && allowedSort.includes(sortBy)) args.sortBy = sortBy
      const sport = query.get('sport')
      if (sport !== null && sport.trim() !== '') args.sport = sport.trim()
      return client.callTool('list_runs', args)
    },

    /** Detail bundle for one run. */
    async run(runId: string): Promise<Record<string, unknown>> {
      const errors: ApiError[] = []
      const [detail, splits, route, elevation, stops, classification] = await Promise.all([
        capture(errors, 'get_run_detail', () => client.callTool('get_run_detail', { runId })),
        capture(errors, 'get_run_splits', () => client.callTool('get_run_splits', { runId })),
        capture(errors, 'get_run_route', () => client.callTool('get_run_route', { runId, maxPoints: 300 })),
        capture(errors, 'get_elevation_profile', () => client.callTool('get_elevation_profile', { runId })),
        capture(errors, 'get_stop_points', () => client.callTool('get_stop_points', { runId })),
        capture(errors, 'classify_run', () => client.callTool('classify_run', { runId })),
      ])
      return {
        ok: detail !== undefined,
        runId,
        generatedAt: nowText(),
        detail,
        splits,
        route,
        elevation,
        stops,
        classification,
        errors,
      }
    },

    /** Connection probe used by the dashboard and by manual checks. */
    async health(): Promise<Record<string, unknown>> {
      try {
        const tools = await client.listTools()
        return {
          ok: true,
          url: config.url,
          toolCount: tools.length,
          tools: tools.map(tool => tool.name),
          checkedAt: nowText(),
        }
      } catch (error) {
        return {
          ok: false,
          url: config.url,
          checkedAt: nowText(),
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  }
}

export type SportHealthApi = ReturnType<typeof createSportHealthApi>

function nowText(): string {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function clampNumber(raw: string | null, min: number, max: number, fallback: number): number {
  if (raw === null || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}
