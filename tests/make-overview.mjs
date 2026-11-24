/**
 * Rebuild `tests/fixtures/api-overview.json` from the captured single-tool
 * fixtures. The snapshot fixture is gitignored (like every tests JSON file), so
 * this is the reproducible way to refresh it after re-capturing tool payloads.
 *
 *   node tests/make-overview.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = (tool) => JSON.parse(readFileSync(join(root, 'tests/fixtures', `sport-${tool}.json`), 'utf8'))

/** overview section key -> MCP tool whose captured payload feeds it. */
const SECTIONS = {
  summary: 'get_running_summary',
  daily: 'get_daily_running',
  mix: 'get_training_mix',
  consistency: 'get_consistency',
  load: 'get_training_load',
  bests: 'get_personal_bests',
  weather: 'get_weather_impact',
  runs: 'list_runs',
  trend: 'get_training_trend',
  predictions: 'predict_race_time',
  sleepSummary: 'get_sleep_summary',
  sleepTrend: 'get_sleep_trend',
  recovery: 'get_recovery_status',
  vitals: 'get_daily_vitals',
  hrv: 'get_hrv_trend',
  stress: 'get_stress_series',
  bloodOxygen: 'get_blood_oxygen',
  activity: 'get_daily_activity',
  activityMinutes: 'get_activity_minutes',
  heartRate: 'get_heart_rate_series',
  bodyComposition: 'get_body_composition',
  weeklyReport: 'get_weekly_health_report',
  medals: 'get_medals',
  ecg: 'get_ecg_records',
  runLevel: 'get_run_level',
  dynamics: 'get_running_dynamics',
  officialSplits: 'get_official_splits',
}

const overview = {
  ok: true,
  url: 'http://127.0.0.1:8098/mcp',
  generatedAt: '2026-11-24 09:00:00',
  ...Object.fromEntries(Object.entries(SECTIONS).map(([key, tool]) => [key, fixture(tool)])),
  errors: [],
}

const target = join(root, 'tests/fixtures/api-overview.json')
writeFileSync(target, `${JSON.stringify(overview)}\n`)
console.log(`wrote ${Object.keys(SECTIONS).length} sections -> ${target}`)
