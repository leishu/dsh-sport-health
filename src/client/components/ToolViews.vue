/**
 * 20 tool views, one per sport-health MCP tool.
 *
 * Every view receives the parsed payload as `d` and is composed from the same
 * kit: `ShKpi` tiles, `ShPanel` cards, ECharts wrappers and `ElTable`. They are
 * registered in `RENDERERS` so `ToolCard.vue` can pick one by tool name.
 */
<script setup lang="ts">
import { computed } from 'vue'
import { ElAlert, ElDescriptions, ElDescriptionsItem, ElProgress, ElTable, ElTableColumn, ElTag } from './element.ts'
import { ShPanel } from './Kit.vue'
import ShKpi from './Kit.vue'
import Chart from './Chart.vue'
import BarList from './BarList.vue'
import Heatmap from './Heatmap.vue'
import RouteMap from './RouteMap.vue'
import { C, RISK_TEXT, RISK_TONE, TYPE_TONE, tagType } from '../lib/theme.ts'
import { distanceLabel, fmt, fmtDuration, fmtPace, fmtSeconds, shortDate, signed } from '../lib/format.ts'
import { rangeOf, splitRange } from '../lib/payload.ts'

const props = defineProps<{ d: any; tool?: string }>()
const d = computed(() => props.d ?? {})

/** Which tool this payload belongs to; set by the card from the wire tool name. */
const tool = computed(() => String(props.tool ?? ''))
const range = computed(() => rangeOf(d.value) ?? '')

/**
 * Which view to render.
 *
 * Tool names are authoritative: several payloads carry overlapping fields
 * (`get_training_mix` also returns `runs`, `get_run_detail` has no `splits`…),
 * so sniffing the payload in template order picks the wrong branch. Only the
 * keys below pick a view; anything else falls through to structural guessing.
 */
type ViewName =
  | 'summary' | 'source' | 'runs' | 'groups' | 'trend' | 'mix' | 'consistency'
  | 'bests' | 'load' | 'weather' | 'predict' | 'detail' | 'splits' | 'efforts'
  | 'route' | 'elevation' | 'stops' | 'classify' | 'compare' | 'reload' | 'generic'
  // MCP 服务新功能（sport-health-mcp-server 的 42 个工具里新增的 22 个）
  | 'summaryData' | 'streams' | 'dynamics' | 'runLevel' | 'officialSplits'
  | 'syncWeather' | 'heartRate' | 'sleepSummary' | 'sleepDetail' | 'sleepTrend'
  | 'recovery' | 'vitals' | 'hrvTrend' | 'stress' | 'bloodOxygen'
  | 'activity' | 'activityMinutes' | 'weeklyReport' | 'medals' | 'ecgRecords'
  | 'sampleSequences' | 'bodyComposition'

const TOOL_VIEW_BY_TOOL: Record<string, ViewName> = {
  get_running_summary: 'summary',
  describe_data_source: 'source',
  list_runs: 'runs',
  get_daily_running: 'groups',
  get_training_trend: 'trend',
  get_training_mix: 'mix',
  get_consistency: 'consistency',
  get_personal_bests: 'bests',
  get_training_load: 'load',
  get_weather_impact: 'weather',
  predict_race_time: 'predict',
  get_run_detail: 'detail',
  get_run_splits: 'splits',
  get_best_efforts: 'efforts',
  get_run_route: 'route',
  get_elevation_profile: 'elevation',
  get_stop_points: 'stops',
  classify_run: 'classify',
  compare_runs: 'compare',
  reload_data: 'reload',
  // ── MCP 服务新功能 ──
  get_run_summary_data: 'summaryData',
  get_run_streams: 'streams',
  get_running_dynamics: 'dynamics',
  get_run_level: 'runLevel',
  get_official_splits: 'officialSplits',
  sync_weather: 'syncWeather',
  get_heart_rate_series: 'heartRate',
  get_sleep_summary: 'sleepSummary',
  get_sleep_detail: 'sleepDetail',
  get_sleep_trend: 'sleepTrend',
  get_recovery_status: 'recovery',
  get_daily_vitals: 'vitals',
  get_hrv_trend: 'hrvTrend',
  get_stress_series: 'stress',
  get_blood_oxygen: 'bloodOxygen',
  get_daily_activity: 'activity',
  get_activity_minutes: 'activityMinutes',
  get_weekly_health_report: 'weeklyReport',
  get_medals: 'medals',
  get_ecg_records: 'ecgRecords',
  get_sample_sequences: 'sampleSequences',
  get_body_composition: 'bodyComposition',
}

/** Structural fallback used when the caller does not know the tool name. */
function guessView(payload: any): ViewName {
  if (!payload || typeof payload !== 'object') return 'generic'
  if (payload.summary) return 'summary'
  if (payload.quality) return 'source'
  if (Array.isArray(payload.runs)) return 'runs'
  if (Array.isArray(payload.groups)) return 'groups'
  if (Array.isArray(payload.periods)) return 'trend'
  if (Array.isArray(payload.types)) return 'mix'
  if (payload.longestStreak) return 'consistency'
  if (payload.bests) return 'bests'
  if (payload.riskLevel !== undefined) return 'load'
  if (payload.sampleSize !== undefined) return 'weather'
  if (Array.isArray(payload.predictions)) return 'predict'
  if (payload.activity) return 'detail'
  if (Array.isArray(payload.splits)) return 'splits'
  if (Array.isArray(payload.efforts)) return 'efforts'
  if (Array.isArray(payload.points)) return 'route'
  if (Array.isArray(payload.buckets)) return 'elevation'
  if (Array.isArray(payload.stops)) return 'stops'
  if (payload.type && payload.paceSecondsPerKm !== undefined) return 'classify'
  if (payload.base || payload.other) return 'compare'
  if (payload.status) return 'reload'
  return 'generic'
}

const view = computed<ViewName>(() => TOOL_VIEW_BY_TOOL[tool.value] ?? guessView(d.value))

const tone = (type: string | undefined) => TYPE_TONE[type ?? ''] ?? C.accent

/** Identity helper that gives template literals KPI shape inference. */
const kpiItems = (items: Array<{ label: string; value?: string | number; unit?: string; hint?: string; tone?: string }>) => items
const tag = (type: string | undefined) => tagType(tone(type))

/* ── get_running_summary ───────────────────────────────────────────────── */

const summary = computed(() => d.value.summary ?? {})
const summaryCoverage = computed(() => {
  const s = summary.value
  return s.dayCount > 0 ? Math.min(100, Math.round((s.recordedDays / s.dayCount) * 100)) : 0
})
const summaryKpis = computed(() => {
  const s = summary.value
  return [
    { label: '总距离', value: fmt(s.totalDistanceKm), unit: 'km' },
    { label: '总时长', value: fmtDuration(s.totalDurationMinutes) },
    { label: '跑步次数', value: s.runCount ?? '—', unit: '次' },
    { label: '平均配速', value: s.avgPaceText ?? fmtPace(s.avgPaceSecondsPerKm) },
    { label: '平均距离', value: fmt(s.avgDistanceKm), unit: 'km' },
    { label: '总爬升', value: fmt(s.totalClimbMeters), unit: 'm' },
  ]
})

/* ── list_runs ─────────────────────────────────────────────────────────── */

const runs = computed<any[]>(() => (Array.isArray(d.value.runs) ? d.value.runs : []))
const orderedRuns = computed(() => [...runs.value].sort((a, b) => String(a.date).localeCompare(String(b.date))))
const runsTotals = computed(() => {
  const list = runs.value
  const distance = list.reduce((sum, run) => sum + (run.distanceKm ?? 0), 0)
  const minutes = list.reduce((sum, run) => sum + (run.durationMinutes ?? 0), 0)
  return {
    distance,
    minutes,
    climb: list.reduce((sum, run) => sum + (run.climbMeters ?? 0), 0),
    pace: distance > 0 ? (minutes * 60) / distance : null,
  }
})
const runPoints = computed(() => orderedRuns.value.map(run => ({ label: shortDate(run.date), value: run.distanceKm ?? 0, meta: run.id })))
const runsTable = computed(() => [...orderedRuns.value].reverse())

/* ── get_daily_running ─────────────────────────────────────────────────── */

const groups = computed<any[]>(() => (Array.isArray(d.value.groups) ? d.value.groups : []))
const groupLabel = (group: any) => group.label ?? shortDate(group.from) ?? ''
const dailyDistance = computed(() => groups.value.map(group => ({ label: groupLabel(group), value: group.distanceKm ?? 0 })))
const dailyPace = computed(() => groups.value.map(group => ({ label: groupLabel(group), value: group.paceSecondsPerKm ?? null })))

/* ── get_training_trend ────────────────────────────────────────────────── */

const periods = computed<any[]>(() => (Array.isArray(d.value.periods) ? d.value.periods : []))
const periodLabel = (period: any) => shortDate(period.from) ?? ''
const trendDistance = computed(() => periods.value.map(period => ({ label: periodLabel(period), value: period.distanceKm ?? 0 })))
const trendPace = computed(() => periods.value.map(period => ({ label: periodLabel(period), value: period.paceSecondsPerKm ?? null })))
const trendDelta = computed(() => periods.value
  .filter(period => period.distanceDeltaPercent !== null && period.distanceDeltaPercent !== undefined)
  .map(period => ({
    label: periodLabel(period),
    value: period.distanceDeltaPercent,
    color: period.distanceDeltaPercent >= 0 ? C.green : C.amber,
    meta: `${fmt(period.distanceKm)} km`,
  })))

/* ── get_training_mix ──────────────────────────────────────────────────── */

const mixTypes = computed<any[]>(() => (Array.isArray(d.value.types) ? d.value.types : []))
const mixSlices = computed(() => mixTypes.value.map(type => ({
  label: type.typeText ?? type.type,
  value: type.distanceKm ?? 0,
  color: TYPE_TONE[type.type],
})))
const mixTotal = computed(() => mixTypes.value.reduce((sum, type) => sum + (type.distanceKm ?? 0), 0))

/* ── get_consistency ───────────────────────────────────────────────────── */

const consistencyDays = computed<any[]>(() => (Array.isArray(d.value.days) ? d.value.days : []))
/** 两个 computed 而不是在 setup 里解构 `splitRange(range.value)`，否则换结果后区间不更新。 */
const rangeFrom = computed(() => splitRange(range.value)[0])
const rangeTo = computed(() => splitRange(range.value)[1])

/* ── get_personal_bests ────────────────────────────────────────────────── */

const BEST_SPECS: Array<{ key: string; label: string; value: (b: any) => string; hint: (b: any) => string }> = [
  { key: 'longestDistance', label: '最长距离', value: b => `${fmt(b.distanceKm)} km`, hint: b => `${b.date} · ${b.durationText}` },
  { key: 'fastestPace', label: '最快配速', value: b => b.paceText, hint: b => `${b.date} · ${fmt(b.distanceKm)} km` },
  { key: 'longestDuration', label: '最长时长', value: b => b.durationText, hint: b => `${b.date} · ${fmt(b.distanceKm)} km` },
  { key: 'mostClimb', label: '最大爬升', value: b => `${fmt(b.climbMeters)} m`, hint: b => `${b.date} · ${fmt(b.distanceKm)} km` },
  { key: 'best1k', label: '最佳 1K', value: b => b.durationText, hint: b => `${b.paceText} · ${b.date}` },
  { key: 'best3k', label: '最佳 3K', value: b => b.durationText, hint: b => `${b.paceText} · ${b.date}` },
  { key: 'best5k', label: '最佳 5K', value: b => b.durationText, hint: b => `${b.paceText} · ${b.date}` },
  { key: 'best10k', label: '最佳 10K', value: b => b.durationText, hint: b => `${b.paceText} · ${b.date}` },
  { key: 'best15k', label: '最佳 15K', value: b => b.durationText, hint: b => `${b.paceText} · ${b.date}` },
  { key: 'bestHalf', label: '最佳 半马', value: b => b.durationText, hint: b => `${b.paceText} · ${b.date}` },
  { key: 'bestMarathon', label: '最佳 全马', value: b => b.durationText, hint: b => `${b.paceText} · ${b.date}` },
]
const bests = computed(() => d.value.bests ?? {})
const bestKpis = computed(() => {
  const known = new Set(BEST_SPECS.map(spec => spec.key))
  const kpis = BEST_SPECS
    .filter(spec => bests.value[spec.key] !== null && bests.value[spec.key] !== undefined)
    .map(spec => ({ label: spec.label, value: spec.value(bests.value[spec.key]), hint: spec.hint(bests.value[spec.key]) }))
  // distancesKm 可以是任意目标距离（2.5/7/12.5k…）：键是 effortLabel 的 bestX…k 形式
  for (const [key, effort] of Object.entries(bests.value) as Array<[string, any]>) {
    if (known.has(key) || effort === null || effort === undefined) continue
    kpis.push({ label: `最佳 ${key.replace(/^best/, '')}`, value: effort.durationText, hint: `${effort.paceText} · ${effort.date}` })
  }
  return kpis
})
/** 目标距离列表（含未覆盖的）：点评「你的比赛预测是按哪些距离算的」。 */
const bestsEffortNote = computed(() => {
  const targets = bests.value.effortDistancesKm
  if (!Array.isArray(targets) || targets.length === 0) return ''
  const parts = [`目标距离：${targets.map((km: number) => fmt(km, 1)).join('、')} km`]
  const unavailable = bests.value.unavailableDistancesKm
  if (Array.isArray(unavailable) && unavailable.length > 0) {
    parts.push(`未覆盖：${unavailable.map((km: number) => fmt(km, 1)).join('、')} km`)
  }
  return parts.join(' · ')
})

/* ── get_training_load ─────────────────────────────────────────────────── */

const riskTone = computed(() => RISK_TONE[d.value.riskLevel] ?? C.amber)
const riskLabel = computed(() => RISK_TEXT[d.value.riskLevel] ?? d.value.riskLevel ?? '—')
const loadKpis = computed(() => [
  { label: '急性负荷 (7 天)', value: fmt(d.value.acute?.distanceKm), unit: 'km' },
  { label: '慢性周均 (28 天)', value: fmt(d.value.chronicWeeklyAverage), unit: 'km' },
  { label: '周增幅', value: signed(d.value.weeklyRampPercent ?? 0), unit: '%', tone: (d.value.weeklyRampPercent ?? 0) > 30 ? C.red : C.green },
  { label: '近 7 天休息', value: d.value.restDaysLast7 ?? '—', unit: '天' },
  { label: '连续训练', value: d.value.consecutiveTrainingDays ?? '—', unit: '天' },
  { label: '单调性', value: fmt(d.value.monotony, 2) },
])

/* ── get_weather_impact ────────────────────────────────────────────────── */

const bucket = (key: string): any[] => (Array.isArray(d.value[key]) ? d.value[key] : [])
const delta = (key: string) => bucket(key)
  .filter(item => item.paceDeltaSecondsPerKm !== null && item.paceDeltaSecondsPerKm !== undefined)
  .map(item => ({
    label: item.label,
    value: item.paceDeltaSecondsPerKm,
    color: item.paceDeltaSecondsPerKm <= 0 ? C.green : C.amber,
    meta: `${item.runCount} 次`,
  }))
const deltaFormat = (value: number) => signed(value)

/* ── predict_race_time ─────────────────────────────────────────────────── */

const predictions = computed<any[]>(() => (Array.isArray(d.value.predictions) ? d.value.predictions : []))
const references = computed<any[]>(() => (Array.isArray(d.value.references) ? d.value.references : []))
const officialRows = computed<any[]>(() => (Array.isArray(d.value.official?.predictions) ? d.value.official.predictions : [])
  .map((row: any) => ({
    target: distanceLabel(row.targetMeters ?? (row.targetKm ?? 0) * 1000),
    official: row.officialText ?? '—',
    riegel: row.riegelText ?? '—',
    riegelSource: row.riegelSource ?? '—',
    delta: row.deltaText ?? '—',
  })))
const predictionPoints = computed(() => predictions.value.map(row => ({
  label: distanceLabel(row.targetMeters),
  value: row.predictedSeconds ?? 0,
  color: row.source === 'ACTUAL' ? C.green : C.accent,
})))

/* ── get_run_detail ────────────────────────────────────────────────────── */

const activity = computed(() => d.value.activity ?? {})
const weather = computed(() => d.value.weather ?? {})
const weatherCards = computed(() => [
  { title: '起跑时', data: weather.value.start },
  { title: '结束时', data: weather.value.end },
].filter(entry => entry.data))
/** 华为导出独有的第二批字段（心率/步频/热量/起跑即已有）。 */
const detailExtraKpis = computed(() => [
  { label: '平均心率', value: activity.value.avgHeartRate, unit: 'bpm' },
  { label: '最高心率', value: activity.value.maxHeartRate, unit: 'bpm' },
  { label: '最低心率', value: activity.value.minHeartRate, unit: 'bpm' },
  { label: '平均步频', value: activity.value.avgCadence, unit: '步/分' },
  { label: '步数', value: activity.value.totalSteps, unit: '步' },
  { label: '活动热量', value: fmt(activity.value.totalCaloriesKcal), unit: 'kcal' },
  { label: 'summaryData', value: activity.value.summaryData?.available ? `可用 · ${fmt(activity.value.summaryData.bytes)} B` : '暂无' },
].filter(item => item.value !== null && item.value !== undefined && item.value !== '—'))

/* ── get_run_splits ────────────────────────────────────────────────────── */

const splits = computed<any[]>(() => (Array.isArray(d.value.splits) ? d.value.splits : []))
const vendorSplits = computed(() => (Array.isArray(d.value.vendorSplits?.splits) ? d.value.vendorSplits.splits : []))
const vendorSplitPoints = computed(() => vendorSplits.value.map((v: any) => ({
  label: `${fmt(v.fromKm)}–${fmt(v.toKm)}`,
  value: v.paceSecondsPerKm ?? null,
  meta: v.paceText ?? undefined,
})))
const splitCrossCheck = computed(() => d.value.splitCrossCheck)
const splitPaces = computed(() => splits.value
  .map(split => split.paceSecondsPerKm)
  .filter((value): value is number => typeof value === 'number'))
const fastestPace = computed(() => (splitPaces.value.length ? Math.min(...splitPaces.value) : 0))
const slowestPace = computed(() => (splitPaces.value.length ? Math.max(...splitPaces.value) : 0))
const splitPoints = computed(() => splits.value.map(split => ({
  label: `${fmt(split.fromKm)}–${fmt(split.toKm)}`,
  value: split.paceSecondsPerKm ?? 0,
  color: split.paceSecondsPerKm === fastestPace.value ? C.green
    : split.paceSecondsPerKm === slowestPace.value ? C.red : C.accent,
})))

/* ── get_best_efforts ──────────────────────────────────────────────────── */

const efforts = computed<any[]>(() => (Array.isArray(d.value.efforts) ? d.value.efforts : []))
const effortKpis = computed(() => efforts.value.map(effort => ({
  label: `最佳 ${distanceLabel(effort.targetMeters)}`,
  value: effort.durationText,
  hint: `${effort.paceText} · 区间 ${fmt(effort.startKm)}–${fmt(effort.endKm)} km`,
})))
const effortPoints = computed(() => efforts.value.map(effort => ({
  label: distanceLabel(effort.targetMeters),
  value: effort.durationSeconds,
  meta: effort.paceText,
})))
const unavailable = computed<any[]>(() => (Array.isArray(d.value.unavailableTargetsMeters) ? d.value.unavailableTargetsMeters : []))

/* ── get_run_route ─────────────────────────────────────────────────────── */

const routePoints = computed<any[]>(() => (Array.isArray(d.value.points) ? d.value.points : []))
const routeStart = computed(() => routePoints.value[0])
const routeEnd = computed(() => routePoints.value[routePoints.value.length - 1])

/* ── get_elevation_profile ─────────────────────────────────────────────── */

const buckets = computed<any[]>(() => (Array.isArray(d.value.buckets) ? d.value.buckets : []))
const altitudePoints = computed(() => buckets.value.map(bk => ({ label: fmt(bk.fromKm), value: bk.avgAltitudeMeters ?? null })))
const gainPoints = computed(() => buckets.value.map(bk => ({ label: fmt(bk.fromKm), value: bk.gainMeters ?? 0 })))

/* ── get_stop_points ───────────────────────────────────────────────────── */

const stops = computed<any[]>(() => (Array.isArray(d.value.stops) ? d.value.stops : []))
const stopsDuration = (stop: any) => stop.durationText ?? fmtDuration((stop.durationSeconds ?? 0) / 60)

/* ── classify_run ──────────────────────────────────────────────────────── */

const classifyCompare = computed(() => [
  { label: '本次', value: d.value.paceSecondsPerKm ?? 0, color: tone(d.value.type) },
  { label: '个人中位', value: d.value.baselinePaceSecondsPerKm ?? 0, color: C.slate },
  { label: '坡度修正', value: d.value.gradeAdjustedPaceSecondsPerKm ?? 0, color: C.cyan },
])
const reasons = computed<string[]>(() => (Array.isArray(d.value.reasons) ? d.value.reasons : []))

/* ── compare_runs ──────────────────────────────────────────────────────── */

const compareBase = computed(() => d.value.base ?? {})
const compareOther = computed(() => d.value.other ?? {})
const compareBaseSplits = computed(() => (Array.isArray(d.value.splits?.base) ? d.value.splits.base : []))
const compareOtherSplits = computed(() => (Array.isArray(d.value.splits?.other) ? d.value.splits.other : []))
const compareSplitKm = computed(() => d.value.splits?.splitMeters)
const compareNoGps = computed(() => d.value.splits?.noGpsRunIds ?? [])
const diff = (label: string, value: number | null | undefined, unit: string, betterWhenNegative = false) => {
  if (value === null || value === undefined) return { label, value: '—', tone: undefined as string | undefined }
  const good = betterWhenNegative ? value < 0 : value > 0
  return {
    label,
    value: `${signed(value)} ${unit}`,
    tone: value === 0 ? undefined : good ? C.green : C.amber,
  }
}
const compareDiffs = computed(() => [
  diff('配速差', d.value.paceDiffSecondsPerKm, '秒/km', true),
  diff('距离差', d.value.distanceDiffKm, 'km'),
  diff('时长差', d.value.durationDiffMinutes, '分钟'),
])

/* ── describe_data_source ──────────────────────────────────────────────── */

const storage = computed(() => d.value.storage ?? {})
const storageWeather = computed(() => storage.value.weather ?? {})
const quality = computed(() => d.value.quality ?? {})
const datapoints = computed(() => [
  { key: '数据目录', value: d.value.dataDir ?? '—' },
  { key: '时区', value: d.value.zoneId ?? '—' },
  { key: '加载时间', value: d.value.loadedAt ?? '—' },
  { key: '最近同步', value: storage.value.syncedAt ?? '—' },
  { key: 'SQLite', value: storage.value.dbPath ?? '—' },
  { key: '运动类型', value: Array.isArray(d.value.sports) ? d.value.sports.join('、') : '—' },
  { key: '设备', value: Array.isArray(d.value.creators) ? d.value.creators.join('、') : '—' },
])
const files = computed<string[]>(() => (Array.isArray(d.value.files) ? d.value.files : []))
const warnings = computed<string[]>(() => (Array.isArray(d.value.warnings) ? d.value.warnings : []))

/* ── reload_data ───────────────────────────────────────────────────────── */

const reloadKpis = computed(() => [
  { label: '状态', value: d.value.status ?? '—', tone: d.value.status === 'OK' ? C.green : C.red },
  { label: '记录数', value: d.value.runCount ?? 0, unit: '条' },
  { label: '扫描文件', value: d.value.storage?.scannedFiles ?? '—' },
  { label: '新导入', value: d.value.storage?.importedFiles ?? 0 },
  { label: '未变化', value: d.value.storage?.unchangedFiles ?? 0 },
  { label: '同步时间', value: d.value.storage?.syncedAt ?? '—' },
])

/* ── generic fallback ──────────────────────────────────────────────────── */

const genericEntries = computed(() => (d.value && typeof d.value === 'object' && !Array.isArray(d.value)
  ? Object.entries(d.value)
    .filter(([, value]) => ['number', 'string', 'boolean'].includes(typeof value))
    .slice(0, 8)
    .map(([key, value]) => ({ label: key, value: String(value) }))
  : []))

/* ── MCP 服务新功能：get_run_summary_data（华为 summaryData） ─────────────── */

const summaryData = computed(() => d.value.decoded ?? {})
const summaryDataKpis = computed(() => [
  { label: '距离', value: fmt(summaryData.value.distanceKm, 2), unit: 'km' },
  { label: '时长', value: summaryData.value.durationText ?? fmtDuration((summaryData.value.durationSeconds ?? 0) / 60) },
  { label: '平均配速', value: summaryData.value.avgPaceText ?? fmtPace(summaryData.value.avgPaceSecondsPerKm) },
  { label: '最快配速', value: summaryData.value.bestPaceText ?? fmtPace(summaryData.value.bestPaceSecondsPerKm) },
  { label: '热量', value: fmt(summaryData.value.caloriesKcal ?? summaryData.value.activeCaloriesKcal), unit: 'kcal' },
  { label: '平均心率', value: summaryData.value.heartRate?.avg, unit: 'bpm' },
  { label: '最高心率', value: summaryData.value.heartRate?.max, unit: 'bpm' },
  { label: '步数', value: summaryData.value.cadence?.totalSteps ?? 0, unit: '步' },
  { label: '原文字段', value: d.value.fieldCount ?? 0, unit: '个' },
])
const summaryDataRows = computed(() => Object.entries(summaryData.value)
  .filter(([, value]) => value !== null && value !== undefined && !Array.isArray(value))
  .map(([key, value]) => ({ label: key, value: typeof value === 'object' ? JSON.stringify(value) : String(value) })))
const summaryDataKmSplits = computed(() => (Array.isArray(summaryData.value.kmSplits) ? summaryData.value.kmSplits : []))

/* ── MCP 服务新功能：get_run_streams（track_stream） ─────────────────────── */

const streamCatalog = computed(() => (Array.isArray(d.value.streams) ? d.value.streams : []))
const streamMode = computed(() => Boolean(d.value.type))
const streamCatalogRows = computed(() => streamCatalog.value.map((stream: any) => ({
  type: stream.type,
  rows: stream.rows,
  unit: stream.unit ?? '',
  valueRange: stream.valueRange ? `${fmt(stream.valueRange.min, 3)}–${fmt(stream.valueRange.avg, 3)}–${fmt(stream.valueRange.max, 3)}` : '',
  meaning: stream.meaning,
})))
const streamSampleRows = computed(() => streamCatalog.value
  .map((stream: any) => ({ type: stream.type, ...stream.sample }))
  .filter((row: any) => row && row.type !== undefined))
const streamDetailRows = computed(() => (Array.isArray(d.value.rows) ? d.value.rows : []))
const streamDetailFields = (row: any) => (row?.fields && Object.keys(row.fields).length > 0 ? JSON.stringify(row.fields) : '')

/* ── MCP 服务新功能：get_running_dynamics（跑姿与步幅） ───────────────────── */

const dynamicsScope = computed(() => d.value.scope ?? 'run')
const dynamicsSummary = computed(() => d.value.summary ?? {})
const dynamicsKpis = computed(() => [
  { label: '距离', value: fmt(dynamicsSummary.value.distanceKm, 2), unit: 'km' },
  { label: '平均配速', value: dynamicsSummary.value.paceText ?? fmtPace(dynamicsSummary.value.paceSecondsPerKm) },
  { label: '触地时间', value: dynamicsSummary.value.groundContactTimeMs != null ? `${fmt(dynamicsSummary.value.groundContactTimeMs)} ms` : '—' },
  { label: '垂直振幅', value: dynamicsSummary.value.verticalOscillationCm != null ? `${fmt(dynamicsSummary.value.verticalOscillationCm)} cm` : '—' },
  { label: '左右平衡', value: dynamicsSummary.value.groundBalancePercent != null ? `${fmt(dynamicsSummary.value.groundBalancePercent, 1)}%` : '—' },
  { label: '步幅', value: dynamicsSummary.value.strideLengthMeters != null ? `${fmt(dynamicsSummary.value.strideLengthMeters, 2)} m` : '—' },
  { label: '步频', value: dynamicsSummary.value.cadenceSpm != null ? `${fmt(dynamicsSummary.value.cadenceSpm)} 步/分` : '—' },
])
const dynamicsSegments = computed(() => (Array.isArray(d.value.segments) ? d.value.segments : []))
const dynamicsSegmentPoints = computed(() => dynamicsSegments.value.map((seg: any) => ({
  label: `${fmt(seg.fromKm, 1)}–${fmt(seg.toKm, 1)}`,
  value: seg.paceSecondsPerKm ?? null,
  meta: seg.paceText ?? undefined,
})))
const halvesDelta = computed(() => d.value.halves?.delta ?? {})
const halfDeltaItems = computed(() => [
  { label: '配速差', value: signed(halvesDelta.value.paceSecondsPerKm ?? 0, 1) },
  { label: '触地时间差', value: signed(halvesDelta.value.groundContactTimeMs ?? 0) },
  { label: '垂直振幅差', value: signed(halvesDelta.value.verticalOscillationCm ?? 0, 1) },
  { label: '左右平衡差', value: signed(halvesDelta.value.groundBalancePercent ?? 0, 1) },
  { label: '步幅差', value: signed(halvesDelta.value.strideLengthMeters ?? 0, 2) },
  { label: '步频差', value: signed(halvesDelta.value.cadenceSpm ?? 0) },
].filter(item => item.value !== '—'))
const dynamicsRuns = computed(() => (Array.isArray(d.value.runs) ? d.value.runs : []))
const dynamicsCoverage = computed(() => d.value.coverage ?? {})

/* ── MCP 服务新功能：get_run_level（华为官方跑力） ─────────────────────────── */

const runLevelZones = computed(() => (Array.isArray(d.value.zones) ? d.value.zones : []))
const runLevelTimes = computed(() => (Array.isArray(d.value.officialTimes) ? d.value.officialTimes : []))
const runLevelKpis = computed(() => [
  { label: '华为跑力', value: fmt(d.value.runLevel, 2) },
  { label: '日期', value: d.value.date ?? '—' },
  { label: '官方成绩', value: runLevelTimes.value.length, unit: '项' },
])
const runLevelHistory = computed(() => ((d.value.history?.points ?? []) as any[]).map((point: any) => ({
  label: String(point.date), value: Number(point.score ?? 0),
})))

/* ── MCP 服务新功能：get_official_splits（官方分段 vs GPS） ───────────────── */

const officialUnitBlocks = computed(() => Object.entries(d.value.units ?? {}).filter(([, block]) => block && typeof block === 'object'))
const officialMainBlock = computed<any>(() => officialUnitBlocks.value[0]?.[1] ?? {})
const officialSplits = computed(() => (Array.isArray(officialMainBlock.value.splits) ? officialMainBlock.value.splits : []))
const officialSplitRows = computed(() => officialSplits.value.map((split: any) => ({
  index: split.index,
  fromKm: split.fromKm,
  toKm: split.toKm,
  paceText: split.paceTextPerKm ?? split.paceText,
  gpsPace: split.gpsPaceText,
  delta: split.deltaText,
  cumulativeDelta: split.cumulativeDeltaSeconds,
})))
const officialCompare = computed<any>(() => officialMainBlock.value.comparison)
const officialKpis = computed(() => [
  { label: '平均官方配速', value: officialMainBlock.value.avgPaceTextPerKm ?? officialMainBlock.value.avgPaceText ?? '—' },
  { label: '段数', value: officialMainBlock.value.splitCount ?? 0, unit: '段' },
  { label: '整段数', value: officialMainBlock.value.fullSplitCount ?? 0, unit: '段' },
  { label: '覆盖距离', value: fmt(officialMainBlock.value.coveredKm, 2), unit: 'km' },
  { label: '比较段数', value: officialCompare.value?.comparedSplits ?? 0, unit: '段' },
  { label: '平均绝对差', value: fmt(officialCompare.value?.meanAbsDeltaSecondsPerKm, 1), unit: '秒/公里' },
  { label: '最大差', value: fmt(officialCompare.value?.maxAbsDeltaSecondsPerKm, 1), unit: '秒/公里' },
])

/* ── MCP 服务新功能：sync_weather（天气补齐） ────────────────────────────── */

const syncProblems = computed(() => (Array.isArray(d.value.problems) ? d.value.problems : [])
  .map((problem: any) => ({
    ...problem,
    runId: problem.runId ?? problem.recordId ?? '—',
    reason: problem.reason ?? problem.message ?? problem.error ?? '—',
    retriedAt: problem.retriedAt ?? problem.lastRetryAt ?? problem.attemptedAt ?? '—',
  })))
const syncKpis = computed(() => [
  { label: '本轮处理', value: d.value.total ?? 0, unit: '条' },
  { label: '成功', value: d.value.ok ?? 0, unit: '条' },
  { label: '无数据', value: d.value.unavailable ?? 0, unit: '条' },
  { label: '失败', value: d.value.failed ?? 0, unit: '条', tone: (d.value.failed ?? 0) > 0 ? C.red : undefined },
  { label: '缺坐标', value: d.value.noLocation ?? 0, unit: '条' },
  { label: '延后', value: d.value.deferred ?? 0, unit: '条' },
])

/* ── MCP 服务新功能：get_heart_rate_series（动态心率） ─────────────────────── */

const hrStats = computed(() => d.value.stats ?? {})
const hrBuckets = computed(() => (Array.isArray(d.value.buckets) ? d.value.buckets : []))
const hrBucketPoints = computed(() => hrBuckets.value.map((bucket: any) => ({ label: bucket.time, value: bucket.average ?? bucket.min, meta: `max ${bucket.max}` })))
const hrActivities = computed(() => (Array.isArray(d.value.activities) ? d.value.activities : []))
const hrKpis = computed(() => [
  { label: '最低', value: hrStats.value.min, unit: 'bpm' },
  { label: '平均', value: fmt(hrStats.value.average, 1), unit: 'bpm' },
  { label: '最高', value: hrStats.value.max, unit: 'bpm' },
  { label: '采样点', value: hrStats.value.samples, unit: '个' },
  { label: 'span', value: hrStats.value.spanMinutes, unit: '分' },
  { label: '中位间隔', value: hrStats.value.medianGapMinutes, unit: '分' },
  { label: '最长空档', value: hrStats.value.maxGapMinutes, unit: '分' },
])

/* ── MCP 服务新功能：get_sleep_summary（睡眠概览） ─────────────────────────── */

const sleepNights = computed(() => (Array.isArray(d.value.nights) ? d.value.nights : []))
const sleepPeriods = computed(() => (Array.isArray(d.value.periods) ? d.value.periods : []))
const sleepSummaryData = computed(() => d.value.summary ?? {})
const sleepKpis = computed(() => [
  { label: '平均睡眠时长', value: sleepSummaryData.value.avgAsleepText ?? fmtDuration(sleepSummaryData.value.avgAsleepMinutes ?? 0) },
  { label: '区间夜数', value: sleepSummaryData.value.nights ?? d.value.coverage?.nights ?? 0, unit: '夜' },
  { label: '有报告', value: sleepSummaryData.value.reportNights ?? d.value.coverage?.reportDays ?? 0, unit: '夜' },
  { label: '深睡占比', value: sleepSummaryData.value.avgDeepPercent != null ? `${fmt(sleepSummaryData.value.avgDeepPercent, 1)}%` : '—' },
  { label: '快速眼动', value: sleepSummaryData.value.avgRemPercent != null ? `${fmt(sleepSummaryData.value.avgRemPercent, 1)}%` : '—' },
  { label: '评分', value: sleepSummaryData.value.avgScore != null ? fmt(sleepSummaryData.value.avgScore, 0) : '—' },
])
const sleepRows = computed(() => {
  if (sleepNights.value.length > 0) {
    return sleepNights.value.map((night: any) => ({
      label: shortDate(night.date) ?? '',
      bedtime: night.bedtime ?? '—',
      waketime: night.waketime ?? '—',
      timeInBed: fmtDuration(night.timeInBedMinutes),
      asleepText: night.asleepText ?? fmtDuration(night.asleepMinutes ?? 0),
      deep: fmt(night.deepMinutes), light: fmt(night.lightMinutes), rem: fmt(night.remMinutes),
      awake: fmt(night.awakeMinutes), wakes: night.wakeCount ?? '—',
      score: night.score != null ? fmt(night.score, 0) : '—',
      efficiency: night.efficiencyPercent != null ? `${fmt(night.efficiencyPercent, 0)}%` : '—',
    }))
  }
  return sleepPeriods.value.map((period: any) => ({
    label: period.period ?? '', from: period.from ?? '', to: period.to ?? '',
    nights: period.nights, asleepText: period.avgAsleepText ?? '—',
    deep: period.avgDeepPercent != null ? `${fmt(period.avgDeepPercent, 1)}%` : '—',
    wakes: period.avgWakeCount ?? '—', score: period.avgScore != null ? fmt(period.avgScore, 0) : '—',
    efficiency: period.avgEfficiencyPercent != null ? `${fmt(period.avgEfficiencyPercent, 0)}%` : '—',
  }))
})

/* ── MCP 服务新功能：get_sleep_detail（睡眠详情） ─────────────────────────── */

const sleepDetailNights = computed(() => (Array.isArray(d.value.nights) ? d.value.nights : []))
const sleepDetailNight = computed(() => sleepDetailNights.value[0] ?? {})
const sleepStages = computed<any>(() => sleepDetailNight.value.stages ?? {})
const sleepStagesPresent = computed<boolean>(() => Object.values((sleepStages.value ?? {}) as any)
  .some((v: any) => v != null && v > 0))
const sleepTimeline = computed(() => (Array.isArray(sleepDetailNight.value.timeline) ? sleepDetailNight.value.timeline : []))
const sleepStagePoints = computed(() => [
  { label: '深睡', value: sleepStages.value.deepMinutes ?? 0, color: C.purple },
  { label: '浅睡', value: sleepStages.value.lightMinutes ?? 0, color: C.green },
  { label: '快速眼动', value: sleepStages.value.remMinutes ?? 0, color: C.cyan },
  { label: '清醒', value: sleepStages.value.wakeMinutes ?? 0, color: C.slate },
])
const sleepTimelinePoints = computed(() => sleepTimeline.value.map((seg: any) => ({
  label: shortDate(seg.start.slice(0, 10)) ?? '', value: seg.minutes, meta: seg.stage,
})))
const sleepWakeEpisodes = computed(() => (Array.isArray(sleepDetailNight.value.wakeEpisodes) ? sleepDetailNight.value.wakeEpisodes : []))
const sleepFragments = computed(() => sleepDetailNight.value.fragments)
const sleepDetailKpis = computed(() => [
  { label: '卧床时长', value: sleepDetailNight.value.timeInBedMinutes, unit: '分' },
  { label: '睡眠时长', value: sleepDetailNight.value.asleepMinutes != null ? fmtDuration(sleepDetailNight.value.asleepMinutes) : '—' },
  { label: '夜间清醒', value: sleepDetailNight.value.awakeMinutes, unit: '分' },
  { label: '醒来次数', value: sleepDetailNight.value.wakeCount ?? '—', unit: '次' },
  { label: '评分', value: sleepDetailNight.value.score, unit: '分' },
  { label: '效率', value: sleepDetailNight.value.efficiencyPercent != null ? `${fmt(sleepDetailNight.value.efficiencyPercent, 0)}%` : '—' },
])

/* ── MCP 服务新功能：get_sleep_trend（睡眠趋势） ───────────────────────────── */

const sleepTrendPoints = computed(() => (Array.isArray(d.value.points) ? d.value.points : []))
const sleepTrendMetricKey = computed(() => {
  const map: Record<string, string> = {
    asleep: 'asleepMinutes', score: 'score', efficiency: 'efficiencyPercent',
    hrv: 'hrvMs', wakeCount: 'wakeCount', deep: 'deepPercent', latency: 'latencyMinutes',
  }
  return map[d.value.metric ?? 'asleep'] ?? 'asleepMinutes'
})
const sleepTrendLine = computed(() => sleepTrendPoints.value.map((point: any) => ({
  label: point.period ?? '', value: point.values?.[sleepTrendMetricKey.value] ?? null, meta: point.asleepText ?? undefined,
})))
const sleepTrendSummary = computed(() => d.value.trend ?? {})
const sleepTrendOverall = computed(() => d.value.overall ?? {})
const sleepTrendKpis = computed(() => [
  { label: '主指标', value: d.value.metric ?? '—' },
  { label: '方向', value: sleepTrendSummary.value.direction, tone: sleepTrendSummary.value.assessment === 'improving' ? C.green : sleepTrendSummary.value.assessment === 'worsening' ? C.red : C.slate },
  { label: '变化', value: sleepTrendSummary.value.change != null ? signed(sleepTrendSummary.value.change, 1) : '—', unit: sleepTrendSummary.value.unit ?? '' },
  { label: 'r²', value: fmt(sleepTrendSummary.value.r2, 2) },
  { label: '周期数', value: sleepTrendSummary.value.periodsUsed ?? 0, unit: '个' },
  { label: '区间夜数', value: sleepTrendOverall.value.nights ?? 0, unit: '夜' },
])

/* ── MCP 服务新功能：get_recovery_status（恢复状态） ────────────────────────── */

const recoverySleep = computed(() => d.value.latestSleep ?? {})
const recoveryVitals = computed(() => d.value.vitals ?? {})
const recoveryTraining = computed(() => d.value.training ?? {})
const recoveryKpis = computed(() => [
  { label: '睡眠评分', value: recoverySleep.value.score != null ? fmt(recoverySleep.value.score, 0) : '—', unit: '分' },
  { label: 'HRV', value: recoverySleep.value.hrvMs, unit: 'ms' },
  { label: '静息心率', value: recoveryVitals.value.restingHeartRateAvg, unit: 'bpm' },
  { label: '训练负荷', value: recoveryTraining.value.riskLevel ?? '—' },
  { label: 'ACWR', value: fmt(recoveryTraining.value.acwr, 2) },
  { label: '今日步数', value: d.value.stepsToday, unit: '步' },
])

/* ── MCP 服务新功能：get_daily_vitals（每日体征） ──────────────────────────── */

const vitalsMetrics = computed(() => d.value.metrics ?? {})
const vitalsMetricRows = computed(() => Object.entries(vitalsMetrics).map(([key, stat]) => ({
  key, unit: stat?.unit ?? '', average: stat?.average, min: stat?.min,
  max: stat?.max, count: stat?.count, direction: stat?.direction, assessment: stat?.assessment,
})))
const vitalsKpis = computed(() => [
  { label: '静息心率', value: vitalsMetrics.value.restingHeartRate?.average, unit: 'bpm' },
  { label: 'HRV RMSSD', value: vitalsMetrics.value.hrv?.average, unit: 'ms' },
  { label: '压力', value: vitalsMetrics.value.stress?.average, unit: '分' },
  { label: 'VO2max', value: vitalsMetrics.value.vo2max?.average, unit: 'ml/kg/min' },
  { label: '全天心率', value: d.value.heartRate?.average, unit: 'bpm' },
  { label: '覆盖天数', value: d.value.coverage?.restingHeartRateDays ?? 0, unit: '天' },
])
const vitalsDays = computed(() => (Array.isArray(d.value.days) ? d.value.days : []))
const vitalsPeriods = computed(() => (Array.isArray(d.value.periods) ? d.value.periods : []))

/* ── MCP 服务新功能：get_hrv_trend（HRV 趋势） ────────────────────────────── */

const hrvPeriods = computed(() => (Array.isArray(d.value.periods) ? d.value.periods : []))
const hrvLine = computed(() => hrvPeriods.value.map((period: any) => ({ label: period.period ?? '', value: period.rmssd ?? null })))
const hrvTrendKpis = computed(() => [
  { label: '平均 RMSSD', value: fmt(d.value.average, 1), unit: 'ms' },
  { label: '最低', value: fmt(d.value.min, 1), unit: 'ms' },
  { label: '最高', value: fmt(d.value.max, 1), unit: 'ms' },
  { label: '首末变化', value: d.value.change != null ? signed(d.value.change, 1) : '—', unit: 'ms' },
  { label: '方向', value: d.value.direction, tone: d.value.assessment === 'improving' ? C.green : d.value.assessment === 'worsening' ? C.red : C.slate },
  { label: 'r²', value: fmt(d.value.r2, 2) },
  { label: '周期数', value: d.value.periodCount ?? 0, unit: '个' },
])

/* ── MCP 服务新功能：get_stress_series（压力曲线） ────────────────────────── */

const stressBuckets = computed(() => (Array.isArray(d.value.buckets) ? d.value.buckets : []).map((bucket: any) => ({
  label: bucket.bucket, value: bucket.average ?? 0, meta: `${bucket.samples} 样本 · ${bucket.level}`,
})))
const stressLevels = computed(() => Object.entries(d.value.levels ?? {}).map(([label, value]: [string, any]) => ({ label, value: value ?? 0 })))
const stressKpis = computed(() => [
  { label: '压力等级', value: d.value.level, tone: d.value.level === 'relaxed' ? C.green : d.value.level === 'high' ? C.red : C.amber },
  { label: '最低', value: d.value.min, unit: '分' },
  { label: '平均', value: fmt(d.value.average, 1), unit: '分' },
  { label: '最高', value: d.value.max, unit: '分' },
  { label: '峰值', value: d.value.peak?.value, unit: '分' },
  { label: '最安时刻', value: d.value.calmest?.time },
])

/* ── MCP 服务新功能：get_blood_oxygen（血氧记录） ──────────────────────────── */

const spo2Daily = computed(() => (Array.isArray(d.value.daily) ? d.value.daily : []))
const spo2LowEvents = computed(() => (Array.isArray(d.value.lowEvents) ? d.value.lowEvents : []))
const spo2Samples = computed(() => (Array.isArray(d.value.samples) ? d.value.samples : []).map((sample: any) => ({ label: sample.time, value: sample.value })))
const spo2Below95 = computed(() => spo2Daily.value.reduce((sum: number, day: any) => sum + (day.below95 ?? 0), 0))
const spo2Kpis = computed(() => [
  { label: '记录天数', value: d.value.days, unit: '天' },
  { label: '记录数', value: d.value.records, unit: '条' },
  { label: '最低', value: spo2Daily.value.reduce((min: number, day: any) => Math.min(min, day.min ?? 99), 99), unit: '%' },
  { label: '最高', value: spo2Daily.value.reduce((max: number, day: any) => Math.max(max, day.max ?? 0), 0), unit: '%' },
  { label: '低于 95% 样本', value: spo2Below95.value },
  { label: '低氧事件', value: d.value.lowEventCount ?? 0, unit: '次' },
])

/* ── MCP 服务新功能：get_daily_activity（日常活动量） ──────────────────────── */

const activityDays = computed(() => (Array.isArray(d.value.days) ? d.value.days : []))
const activityPeriods = computed(() => (Array.isArray(d.value.periods) ? d.value.periods : []))
const activitySummary = computed(() => d.value.summary ?? {})
const activityKpis = computed(() => [
  { label: '总步数', value: fmt(activitySummary.value.totalSteps), unit: '步' },
  { label: '中位步数', value: fmt(activitySummary.value.medianSteps), unit: '步' },
  { label: '日均步数', value: fmt(activitySummary.value.averageSteps), unit: '步' },
  { label: '总距离', value: fmt(activitySummary.value.totalDistanceKm, 2), unit: 'km' },
  { label: '中高强度', value: fmt(activitySummary.value.totalActiveMinutes), unit: '分' },
  { label: '有记录天数', value: activitySummary.value.days ?? d.value.coverage?.recordedDays ?? 0, unit: '天' },
])
const activityDaysPoints = computed(() => activityDays.value.map((day: any) => ({
  label: shortDate(day.date) ?? '', value: day.steps ?? 0, meta: day.walkSteps ? `走路 ${day.walkSteps} 步` : undefined,
})))
const activityGoals = computed(() => d.value.goals ?? {})
const activityTrends = computed(() => Object.entries(d.value.trends ?? {}).map(([key, trend]: [string, any]) => ({ label: key, ...trend })))

/* ── MCP 服务新功能：get_activity_minutes（分钟级活动） ────────────────────── */

const activityMinutesData = computed(() => d.value.summary ?? {})
const activityMinutesRows = computed(() => (Array.isArray(d.value.minutes) ? d.value.minutes : []))
const activityMinutesTypes = computed(() => (Array.isArray(d.value.types) ? d.value.types : []))
const activityMinutesBlocks = computed(() => (Array.isArray(d.value.blocks) ? d.value.blocks : []))
const activityMinutesPoints = computed(() => activityMinutesRows.value.map((row: any) => ({ label: row.time, value: row.steps ?? 0, meta: row.label })))
const activityMinutesKpis = computed(() => [
  { label: '当天步数', value: activityMinutesData.value.steps, unit: '步' },
  { label: '距离', value: fmt(activityMinutesData.value.distanceKm, 2), unit: 'km' },
  { label: '中高强度', value: activityMinutesData.value.activeMinutes, unit: '分' },
  { label: '站立次数', value: activityMinutesData.value.standEvents, unit: '次' },
  { label: '活动分钟', value: activityMinutesData.value.activityMinutes, unit: '分' },
  { label: '原始记录', value: activityMinutesData.value.rawRows, unit: '条' },
])

/* ── MCP 服务新功能：get_weekly_health_report（周健康报告） ────────────────── */

const weeklySteps = computed(() => d.value.steps ?? {})
const weeklySleep = computed(() => d.value.sleep ?? {})
const weeklyVitals = computed(() => d.value.vitals ?? {})
const weeklyRuns = computed(() => d.value.runs ?? {})
const weeklyKpis = computed(() => [
  { label: '总步数', value: fmt(weeklySteps.value.totalSteps), unit: '步' },
  { label: '日均步数', value: fmt(weeklySteps.value.averageSteps), unit: '步' },
  { label: '平均睡眠时长', value: weeklySleep.value.avgAsleepText ?? '—' },
  { label: '睡眠评分', value: weeklySleep.value.avgScore != null ? fmt(weeklySleep.value.avgScore, 0) : '—' },
  { label: '静息心率', value: weeklyVitals.value.restingHeartRate?.average, unit: 'bpm' },
  { label: 'HRV', value: weeklyVitals.value.hrv?.average, unit: 'ms' },
  { label: '跑步次数', value: weeklyRuns.value.runCount ?? 0, unit: '次' },
  { label: '跑步距离', value: fmt(weeklyRuns.value.totalDistanceKm, 1), unit: 'km' },
])

/* ── MCP 服务新功能：get_medals / get_ecg_records / get_sample_sequences ─── */

const medals = computed(() => (Array.isArray(d.value.rows) ? d.value.rows : []))
const ecgRecords = computed(() => (Array.isArray(d.value.rows) ? d.value.rows : []))
const sampleSequences = computed(() => (Array.isArray(d.value.rows) ? d.value.rows : []))

/* ── MCP 服务新功能：get_body_composition（体成分） ───────────────────────── */

const bodyMode = computed(() => d.value.mode === 'measurements' ? 'measurements' : 'configs')
const bodyConfigs = computed(() => (Array.isArray(d.value.configs) ? d.value.configs : []))
const bodyProfile = computed(() => d.value.profile ?? {})
const bodyMeasurements = computed(() => (Array.isArray(d.value.measurements) ? d.value.measurements : []))
const bodyTrends = computed(() => d.value.trends ?? {})
const bodyMonthly = computed(() => (Array.isArray(d.value.byMonth) ? d.value.byMonth : []))
const lastMeasurement = computed(() => {
  const list = bodyMeasurements.value
  return (list[list.length - 1] ?? list[0] ?? {}) as Record<string, any>
})
const bodyMeasureKpis = computed(() => [
  { label: '体重', value: fmt(lastMeasurement.value.weightKg, 2), unit: 'kg' },
  { label: 'BMI', value: fmt(lastMeasurement.value.bmi, 2) },
  { label: '体脂率', value: fmt(lastMeasurement.value.bodyFatPercent, 1), unit: '%' },
  { label: '肌肉量', value: fmt(lastMeasurement.value.muscleMassKg, 2), unit: 'kg' },
  { label: '体水分', value: fmt(lastMeasurement.value.bodyWaterPercent, 1), unit: '%' },
  { label: '内脏脂肪', value: fmt(lastMeasurement.value.visceralFatLevel, 0) },
  { label: '腰臀比', value: fmt(lastMeasurement.value.waistHipRatio, 2) },
  { label: '基础代谢', value: fmt(lastMeasurement.value.basalMetabolismKcal, 0), unit: 'kcal' },
  { label: '体年龄', value: lastMeasurement.value.bodyAge ?? '—' },
  { label: '评分', value: fmt(lastMeasurement.value.bodyScore, 1) },
])
const bodyTrendRows = computed(() => Object.entries(bodyTrends).map(([key, trend]) => ({
  key, unit: (trend as any)?.unit ?? '', first: (trend as any)?.first, last: (trend as any)?.last,
  change: (trend as any)?.change, changePercent: (trend as any)?.changePercent, count: (trend as any)?.count,
})))
const bodyMonthlyPoints = computed(() => bodyMonthly.value.map((row: any) => ({ label: row.month, value: row.weightAverage ?? 0 })))
const bodyMeasurementRows = computed(() => bodyMeasurements.value.map((measurement: any) => ({
  date: measurement.date, time: measurement.time, weightKg: fmt(measurement.weightKg, 2),
  bmi: fmt(measurement.bmi, 2), bodyFatPercent: fmt(measurement.bodyFatPercent, 1),
  muscleMassKg: fmt(measurement.muscleMassKg, 2), bodyWaterPercent: fmt(measurement.bodyWaterPercent, 1),
  visceralFatLevel: fmt(measurement.visceralFatLevel, 0), waistHipRatio: fmt(measurement.waistHipRatio, 2),
  basalMetabolismKcal: fmt(measurement.basalMetabolismKcal, 0), bodyAge: measurement.bodyAge ?? '—',
})))
</script>

<template>
  <!-- get_running_summary -->
  <div v-if="view === 'summary'" class="sh-grid">
    <ShKpi :items="summaryKpis" />
    <ShPanel title="记录覆盖" :subtitle="`${summary.from ?? '—'} ~ ${summary.to ?? '—'} · ${summary.recordedDays ?? 0}/${summary.dayCount ?? 0} 天有记录`">
      <ElProgress :percentage="summaryCoverage" :stroke-width="10" :show-text="false" color="#22c55e" />
      <div class="sh-space" style="justify-content: space-between; margin-top: 6px; font-size: 11px; color: var(--sh-faint)">
        <span>首跑 {{ summary.firstRunDate ?? '—' }}</span>
        <span>最近 {{ summary.lastRunDate ?? '—' }}</span>
      </div>
    </ShPanel>
    <p v-if="d.text" class="sh-note">{{ d.text }}</p>
  </div>

  <!-- describe_data_source -->
  <div v-else-if="view === 'source'" class="sh-grid">
    <ShKpi :items="kpiItems([
      { label: '跑步记录', value: d.runCount ?? 0, unit: '条' },
      { label: '源文件', value: d.fileCount ?? 0, unit: '个' },
      { label: '总距离', value: fmt(d.totalDistanceKm), unit: 'km' },
      { label: '数据质量', value: quality.clean ? '无警告' : `${quality.warningCount ?? '?'} 个警告`, tone: quality.clean ? C.green : C.amber },
      { label: '天气覆盖', value: fmt(storageWeather.coveragePercent), unit: '%' },
      { label: '存储', value: storage.type ?? '—' }])" />
    <ShPanel title="数据源" :subtitle="`${d.firstDate ?? '—'} ~ ${d.lastDate ?? '—'}`">
      <ElDescriptions :column="1" size="small" border>
        <ElDescriptionsItem v-for="row in datapoints" :key="row.key" :label="row.key">
          <span style="word-break: break-all">{{ row.value }}</span>
        </ElDescriptionsItem>
      </ElDescriptions>
    </ShPanel>
    <ShPanel v-if="files.length" title="源文件">
      <div class="sh-space">
        <ElTag v-for="file in files" :key="file" type="info" size="small">{{ file }}</ElTag>
      </div>
    </ShPanel>
    <ElAlert v-if="warnings.length" type="warning" :closable="false" show-icon title="数据警告" :description="warnings.join('；')" />
  </div>

  <!-- list_runs -->
  <div v-else-if="view === 'runs'" class="sh-grid">
    <ShKpi :items="kpiItems([
      { label: '筛选结果', value: d.total ?? runs.length, unit: '条' },
      { label: '总距离', value: fmt(runsTotals.distance), unit: 'km' },
      { label: '总时长', value: fmtDuration(runsTotals.minutes) },
      { label: '平均配速', value: fmtPace(runsTotals.pace) },
      { label: '总爬升', value: fmt(runsTotals.climb), unit: 'm' }])" />
    <ShPanel title="单次距离" :subtitle="[range, d.sortBy ? `排序 ${d.sortBy}` : ''].filter(Boolean).join(' · ')">
      <Chart kind="bar" :data="runPoints" unit=" km" :height="170" />
    </ShPanel>
    <ShPanel title="跑步明细">
      <ElTable :data="runsTable" size="small" max-height="280" stripe>
        <ElTableColumn prop="date" label="日期" min-width="92" />
        <ElTableColumn label="距离" align="right" min-width="86">
          <template #default="{ row }">{{ fmt(row.distanceKm) }} km</template>
        </ElTableColumn>
        <ElTableColumn label="时长" align="right" min-width="120">
          <template #default="{ row }">{{ fmtDuration(row.durationMinutes) }}</template>
        </ElTableColumn>
        <ElTableColumn label="配速" align="right" min-width="92">
          <template #default="{ row }">{{ row.paceText ?? fmtPace(row.paceSecondsPerKm) }}</template>
        </ElTableColumn>
        <ElTableColumn label="爬升" align="right" min-width="80">
          <template #default="{ row }">{{ fmt(row.climbMeters) }} m</template>
        </ElTableColumn>
      </ElTable>
    </ShPanel>
    <p v-if="d.hasMore" class="sh-note">还有更多记录，可调整分页参数继续查询。</p>
  </div>

  <!-- get_daily_running -->
  <div v-else-if="view === 'groups'" class="sh-grid">
    <ShKpi :items="kpiItems([
      { label: '分组数', value: d.groupCount ?? groups.length },
      { label: '总距离', value: fmt(groups.reduce((sum: number, group: any) => sum + (group.distanceKm ?? 0), 0)), unit: 'km' },
      { label: '总时长', value: fmtDuration(groups.reduce((sum: number, group: any) => sum + (group.durationMinutes ?? 0), 0)) },
      { label: '分组方式', value: d.groupBy ?? 'day' }])" />
    <ShPanel title="距离分布" :subtitle="range">
      <Chart kind="bar" :data="dailyDistance" unit=" km" :height="180" />
    </ShPanel>
    <ShPanel title="配速趋势" subtitle="数值越低越快">
      <Chart kind="line" :data="dailyPace" :format="fmtSeconds" :color="C.cyan" :height="140" />
    </ShPanel>
    <ShPanel title="明细">
      <ElTable :data="groups" size="small" max-height="260" stripe>
        <ElTableColumn label="区间" min-width="120">
          <template #default="{ row }">{{ row.label ?? `${row.from} ~ ${row.to}` }}</template>
        </ElTableColumn>
        <ElTableColumn prop="runCount" label="次数" align="right" width="70" />
        <ElTableColumn label="距离" align="right" width="92">
          <template #default="{ row }">{{ fmt(row.distanceKm) }} km</template>
        </ElTableColumn>
        <ElTableColumn label="配速" align="right" width="96">
          <template #default="{ row }">{{ row.paceText ?? '—' }}</template>
        </ElTableColumn>
        <ElTableColumn label="爬升" align="right" width="84">
          <template #default="{ row }">{{ fmt(row.climbMeters) }} m</template>
        </ElTableColumn>
      </ElTable>
    </ShPanel>
    <p v-if="d.text" class="sh-note">{{ d.text }}</p>
  </div>

  <!-- get_training_trend -->
  <div v-else-if="view === 'trend'" class="sh-grid">
    <ShKpi :items="kpiItems([
      { label: '周期', value: d.period ?? '—' },
      { label: '周期数', value: d.count ?? periods.length },
      { label: '本期距离', value: fmt(periods[periods.length - 1]?.distanceKm), unit: 'km' },
      { label: '本期配速', value: periods[periods.length - 1]?.paceText ?? '—' }])" />
    <ShPanel title="跑量趋势" :subtitle="d.text">
      <Chart kind="bar" :data="trendDistance" unit=" km" :height="190" />
    </ShPanel>
    <ShPanel title="配速趋势" subtitle="数值越低越快；空值为没有跑步的周期">
      <Chart kind="line" :data="trendPace" :format="fmtSeconds" :color="C.cyan" :height="140" />
    </ShPanel>
    <ShPanel title="环比变化" subtitle="跑量变化百分比">
      <BarList :items="trendDelta" :format="v => signed(v)" unit="%" />
    </ShPanel>
  </div>

  <!-- get_training_mix -->
  <div v-else-if="view === 'mix'" class="sh-grid">
    <ShKpi :items="kpiItems([
      { label: '总次数', value: d.totalRuns ?? 0, unit: '次' },
      { label: '总距离', value: fmt(mixTotal), unit: 'km' },
      { label: '类型数', value: mixTypes.length }])" />
    <ShPanel title="距离构成" :subtitle="range">
      <Chart kind="donut" :slices="mixSlices" center-label="总距离" :center-value="fmt(mixTotal)" :height="170" />
    </ShPanel>
    <ShPanel title="类型明细">
      <ElTable :data="mixTypes" size="small" stripe>
        <ElTableColumn label="类型" min-width="100">
          <template #default="{ row }">
            <ElTag :type="tag(row.type)" size="small" effect="light" round>{{ row.typeText ?? row.type }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="runCount" label="次数" align="right" width="70" />
        <ElTableColumn label="距离" align="right" width="92">
          <template #default="{ row }">{{ fmt(row.distanceKm) }} km</template>
        </ElTableColumn>
        <ElTableColumn label="占比" align="right" width="80">
          <template #default="{ row }">{{ fmt(row.percent) }}%</template>
        </ElTableColumn>
      </ElTable>
    </ShPanel>
    <ShPanel v-if="Array.isArray(d.runs) && d.runs.length" title="逐次分类">
      <ElTable :data="d.runs" size="small" max-height="220" stripe>
        <ElTableColumn prop="date" label="日期" min-width="92" />
        <ElTableColumn label="类型" min-width="92">
          <template #default="{ row }">
            <ElTag :type="tag(row.type)" size="small" effect="light" round>{{ row.typeText ?? row.type }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="距离" align="right" width="90">
          <template #default="{ row }">{{ fmt(row.distanceKm) }} km</template>
        </ElTableColumn>
        <ElTableColumn label="配速" align="right" width="92">
          <template #default="{ row }">{{ row.paceText ?? '—' }}</template>
        </ElTableColumn>
        <ElTableColumn prop="confidence" label="置信度" align="right" width="84" />
      </ElTable>
    </ShPanel>
  </div>

  <!-- get_consistency -->
  <div v-else-if="view === 'consistency'" class="sh-grid">
    <ShKpi :items="kpiItems([
      { label: '活跃天数', value: d.activeDays ?? 0, unit: `/${d.totalDays ?? '—'} 天` },
      { label: '活跃率', value: fmt(d.activeRatePercent), unit: '%', tone: C.green },
      { label: '当前连续', value: d.currentStreak?.days ?? 0, unit: '天', tone: C.amber },
      { label: '最长连续', value: d.longestStreak?.days ?? 0, unit: '天' },
      { label: '平均间隔', value: fmt(d.avgGapDays), unit: '天' }])" />
    <ShPanel title="训练日历" :subtitle="range">
      <Heatmap :days="consistencyDays" :from="rangeFrom" :to="rangeTo" />
    </ShPanel>
    <div class="sh-split">
      <ShKpi label="当前连续区间" :value="`${d.currentStreak?.from ?? '—'} → ${d.currentStreak?.to ?? '—'}`" />
      <ShKpi label="最长连续区间" :value="`${d.longestStreak?.from ?? '—'} → ${d.longestStreak?.to ?? '—'}`" />
    </div>
    <p v-if="d.text" class="sh-note">{{ d.text }}</p>
  </div>

  <!-- get_personal_bests -->
  <div v-else-if="view === 'bests'" class="sh-grid">
    <ShKpi :items="bestKpis" />
    <p v-if="bestsEffortNote" class="sh-note">{{ bestsEffortNote }}</p>
    <p v-if="d.category && d.category !== 'all'" class="sh-note">类别：{{ d.category }} · {{ range }}</p>
  </div>

  <!-- get_training_load -->
  <div v-else-if="view === 'load'" class="sh-grid">
    <div class="sh-split" style="grid-template-columns: minmax(200px, 0.9fr) minmax(220px, 1.1fr)">
      <ShPanel title="ACWR 负荷比">
        <template #right>
          <ElTag :type="tagType(riskTone)" size="small" effect="light" round>{{ riskLabel }}</ElTag>
        </template>
        <Chart kind="gauge" :value="d.acwr ?? 0" :label="`置信度 ${d.confidence ?? '—'}`" :height="150" />
        <p class="sh-note">ACWR = 近 7 天负荷 / 近 28 天周均负荷。0.8–1.3 通常较安全。</p>
      </ShPanel>
      <ShPanel title="负荷明细" :subtitle="d.anchorDate ? `截至 ${d.anchorDate}` : undefined">
        <ShKpi :items="loadKpis" />
      </ShPanel>
    </div>
    <p v-if="d.dataSufficient === false" class="sh-note">
      当前数据仅覆盖 {{ d.chronicCoverageDays ?? '—' }} 天，ACWR 的参考价值有限。
    </p>
    <ElAlert v-if="d.recommendation" :type="tagType(riskTone) === 'danger' ? 'error' : 'warning'" :closable="false" show-icon :title="`建议 · ${riskLabel}`" :description="d.recommendation" />
    <p v-if="d.text" class="sh-note">{{ d.text }}</p>
  </div>

  <!-- get_weather_impact -->
  <div v-else-if="view === 'weather'" class="sh-grid">
    <ShKpi :items="kpiItems([
      { label: '样本量', value: d.sampleSize ?? d.totalRuns ?? 0, unit: '次' },
      { label: '基准配速', value: d.baselinePaceText ?? '—' },
      { label: '干燥', value: d.dry?.avgPaceText ?? '—', hint: d.dry ? `${d.dry.runCount} 次` : undefined },
      { label: '有降水', value: d.wet?.avgPaceText ?? '—', hint: d.wet ? `${d.wet.runCount} 次` : undefined }])" />
    <ShPanel title="温度对配速的影响" subtitle="相对基准配速的差值；绿色表示更快">
      <BarList :items="delta('temperatureBuckets')" :format="deltaFormat" unit=" 秒/km" />
    </ShPanel>
    <div class="sh-split">
      <ShPanel title="湿度">
        <BarList :items="delta('humidityBuckets')" :format="deltaFormat" unit=" 秒/km" />
      </ShPanel>
      <ShPanel title="风速">
        <BarList :items="delta('windBuckets')" :format="deltaFormat" unit=" 秒/km" />
      </ShPanel>
    </div>
    <p v-if="d.text" class="sh-note">{{ d.text }}</p>
  </div>

  <!-- predict_race_time -->
  <div v-else-if="view === 'predict'" class="sh-grid">
    <ShKpi :items="kpiItems([
      { label: '预测方法', value: d.method ?? '—' },
      { label: '指数', value: fmt(d.exponent, 2) },
      { label: '参考成绩', value: references.length },
      { label: '预测项', value: predictions.length }])" />
    <ShPanel title="预测成绩" subtitle="ACTUAL 表示已有实测成绩，RIEGEL 表示由参考成绩推算">
      <ElTable :data="predictions" size="small" stripe>
        <ElTableColumn label="距离" min-width="80">
          <template #default="{ row }">{{ distanceLabel(row.targetMeters) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="predictedText" label="成绩" align="right" min-width="88" />
        <ElTableColumn prop="paceText" label="配速" align="right" min-width="88" />
        <ElTableColumn label="来源" align="right" min-width="92">
          <template #default="{ row }">
            <ElTag :type="row.source === 'ACTUAL' ? 'success' : 'primary'" size="small" effect="light" round>{{ row.source }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="confidence" label="置信度" align="right" min-width="80" />
      </ElTable>
    </ShPanel>
    <ShKpi v-if="d.official?.status === 'OK'" :items="kpiItems([
      { label: '官方跑力', value: fmt(d.official.runLevel, 2) },
      { label: '快照日期', value: d.official.date },
      { label: '区间内', value: d.official.withinRange ? '是' : '否' },
      { label: '过期天数', value: d.official.staleDays, unit: '天' }])" />
    <ShPanel v-if="officialRows.length" title="华为官方跑力对照" subtitle="Riegel vs HUAWEI_OFFICIAL：两组口径不同，差值官方 − Riegel">
      <ElTable :data="officialRows" size="small" stripe>
        <ElTableColumn prop="target" label="距离" align="right" width="80" />
        <ElTableColumn prop="official" label="官方成绩" align="right" width="95" />
        <ElTableColumn prop="riegel" label="Riegel" align="right" width="95" />
        <ElTableColumn prop="riegelSource" label="来源" align="right" width="85" />
        <ElTableColumn prop="delta" label="差值" align="right" width="85" />
      </ElTable>
    </ShPanel>
    <ShPanel title="预测成绩对比">
      <Chart kind="bar" :data="predictionPoints" :format="fmtSeconds" :height="180" show-values />
    </ShPanel>
    <p v-if="references.length" class="sh-note">
      参考成绩来自 {{ references.map(ref => `${ref.date} ${distanceLabel(ref.targetMeters)}`).join('、') }}。
    </p>
  </div>

  <!-- get_run_detail -->
  <div v-else-if="view === 'detail'" class="sh-grid">
    <ShKpi :items="kpiItems([
      { label: '距离', value: fmt(activity.distanceMeters ? activity.distanceMeters / 1000 : null, 2), unit: 'km' },
      { label: '时长', value: fmtDuration(activity.durationSeconds ? activity.durationSeconds / 60 : null) },
      { label: '平均配速', value: d.paceText ?? '—' },
      { label: '平均速度', value: d.speedText ?? '—' },
      { label: '爬升 / 下降', value: `${fmt(activity.climbMeters)} / ${fmt(activity.descentMeters)}`, unit: 'm' },
      { label: '轨迹点', value: activity.trackPointCount ?? '—' }])" />
    <ShKpi v-if="detailExtraKpis.length" :items="kpiItems(detailExtraKpis)" />
    <ShKpi :items="kpiItems([
      { label: '开始', value: activity.startTime ?? '—' },
      { label: '结束', value: activity.endTime ?? '—' },
      { label: '海拔范围', value: `${fmt(activity.minAltitudeMeters)}–${fmt(activity.maxAltitudeMeters)}`, unit: 'm' },
      { label: '轨迹类型', value: activity.routeTypeText ?? '—' }])" />
    <ShPanel v-if="weatherCards.length" title="天气" :subtitle="weather.provider ? `${weather.provider} · ${weather.status}` : undefined">
      <div class="sh-split" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))">
        <ShKpi
          v-for="card in weatherCards"
          :key="card.title"
          :label="card.title"
          :value="card.data.condition ?? '—'"
          :hint="`${fmt(card.data.temperatureC)}°C · 体感 ${fmt(card.data.apparentTemperatureC)}°C · 湿度 ${fmt(card.data.humidityPercent)}% · 风 ${fmt(card.data.windSpeedKmh)} km/h`"
        />
      </div>
    </ShPanel>
    <p class="sh-note">{{ activity.sport ?? '' }} <span v-if="activity.sourceFile">· 来源 {{ activity.sourceFile }}</span></p>
  </div>

  <!-- get_run_splits -->
  <div v-else-if="view === 'splits'" class="sh-grid">
    <ShKpi :items="kpiItems([
      { label: '平均配速', value: d.avgPaceText ?? '—', hint: d.avgGradeAdjustedPaceText ? `坡度修正 ${d.avgGradeAdjustedPaceText}` : undefined },
      { label: '最快分段', value: d.fastest?.paceText ?? '—', hint: d.fastest ? `${fmt(d.fastest.fromKm)}–${fmt(d.fastest.toKm)} km` : undefined },
      { label: '最慢分段', value: d.slowest?.paceText ?? '—', hint: d.slowest ? `${fmt(d.slowest.fromKm)}–${fmt(d.slowest.toKm)} km` : undefined },
      { label: '负分割', value: d.negativeSplit ? '是' : '否', tone: d.negativeSplit ? C.green : undefined, hint: d.negativeSplit ? '后半程更快' : '后半程不更快' }])" />
    <ShPanel title="分段配速" :subtitle="`每 ${d.splitMeters ?? '—'} m 一段 · 柱越低越快`">
      <Chart kind="bar" :data="splitPoints" :format="fmtSeconds" :height="190" />
    </ShPanel>
    <div class="sh-split" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))">
      <ShKpi label="前半程配速" :value="fmtPace(d.firstHalfPaceSecondsPerKm)" />
      <ShKpi label="后半程配速" :value="fmtPace(d.secondHalfPaceSecondsPerKm)" />
      <ShKpi label="配速标准差" :value="`${fmt(d.paceStdDevSeconds)} 秒`" />
    </div>
    <ShPanel title="分段明细">
      <ElTable :data="splits" size="small" max-height="240" stripe>
        <ElTableColumn label="公里" min-width="90">
          <template #default="{ row }">{{ fmt(row.fromKm) }}–{{ fmt(row.toKm) }}</template>
        </ElTableColumn>
        <ElTableColumn label="配速" align="right" min-width="88">
          <template #default="{ row }">{{ row.paceText ?? '—' }}</template>
        </ElTableColumn>
        <ElTableColumn label="坡度修正" align="right" min-width="92">
          <template #default="{ row }">{{ row.gradeAdjustedPaceText ?? '—' }}</template>
        </ElTableColumn>
        <ElTableColumn label="爬升" align="right" min-width="80">
          <template #default="{ row }">{{ fmt(row.elevationGainMeters) }} m</template>
        </ElTableColumn>
        <ElTableColumn label="坡度" align="right" min-width="72">
          <template #default="{ row }">{{ fmt(row.gradePercent) }}%</template>
        </ElTableColumn>
      </ElTable>
    </ShPanel>
    <ShPanel v-if="vendorSplits.length" title="华为官方分段" subtitle="pm2：设备累计距离切分">
      <Chart kind="bar" :data="vendorSplitPoints" :format="fmtSeconds" :color="C.purple" :height="130" />
    </ShPanel>
    <p v-if="splitCrossCheck?.verdict" class="sh-note">
      交叉校验 {{ splitCrossCheck.comparedSplits }} 段，平均绝对差 {{ fmt(splitCrossCheck.meanAbsDeltaSecondsPerKm, 1) }} 秒/公里，
      最大差 {{ fmt(splitCrossCheck.maxAbsDeltaSecondsPerKm, 1) }} 秒/公里。{{ splitCrossCheck.verdict }}
    </p>
  </div>

  <!-- get_best_efforts -->
  <div v-else-if="view === 'efforts'" class="sh-grid">
    <ShKpi :items="effortKpis" />
    <ShPanel title="各距离最佳成绩">
      <BarList :items="effortPoints" :format="fmtSeconds" />
    </ShPanel>
    <p v-if="unavailable.length" class="sh-note">未覆盖的距离：{{ unavailable.map(item => distanceLabel(Number(item))).join('、') }}</p>
  </div>

  <!-- get_run_route -->
  <div v-else-if="view === 'route'" class="sh-grid">
    <ShKpi :items="kpiItems([
      { label: '轨迹点', value: routePoints.length, unit: `/ ${d.total ?? '—'}` },
      { label: '分页', value: `${d.offset ?? 0} + ${d.limit ?? routePoints.length}` },
      { label: '起点', value: routeStart ? `${fmt(routeStart.latitude, 5)}, ${fmt(routeStart.longitude, 5)}` : '—' },
      { label: '终点', value: routeEnd ? `${fmt(routeEnd.latitude, 5)}, ${fmt(routeEnd.longitude, 5)}` : '—' }])" />
    <RouteMap :points="routePoints" />
    <p v-if="d.hasMore" class="sh-note">轨迹还有更多点，可调整 offset / limit 获取完整路线。</p>
  </div>

  <!-- get_elevation_profile -->
  <div v-else-if="view === 'elevation'" class="sh-grid">
    <ShKpi :items="kpiItems([
      { label: '总爬升', value: fmt(d.totalGainMeters), unit: 'm', tone: C.green },
      { label: '总下降', value: fmt(d.totalLossMeters), unit: 'm', tone: C.red },
      { label: '最低海拔', value: fmt(d.minAltitudeMeters), unit: 'm' },
      { label: '最高海拔', value: fmt(d.maxAltitudeMeters), unit: 'm' },
      { label: 'GPS 距离', value: fmt(d.gpsDistanceKm, 2), unit: 'km' }])" />
    <ShPanel title="海拔剖面" :subtitle="`每 ${d.bucketMeters ?? '—'} m 采样 · 平滑 ${d.smoothingMeters ?? '—'} m`">
      <Chart kind="line" :data="altitudePoints" :color="C.purple" unit=" m" :height="170" />
    </ShPanel>
    <ShPanel title="分段爬升">
      <Chart kind="bar" :data="gainPoints" :color="C.amber" unit=" m" :height="130" />
    </ShPanel>
  </div>

  <!-- get_stop_points -->
  <div v-else-if="view === 'stops'" class="sh-grid">
    <ShKpi :items="kpiItems([
      { label: '停留次数', value: d.stopCount ?? stops.length },
      { label: '总停留', value: d.totalStopText ?? fmtDuration((d.totalStopSeconds ?? 0) / 60) },
      { label: '最短判定', value: `${fmt(d.minStopSeconds)} 秒` },
      { label: '最大位移', value: `${fmt(d.maxDisplacementMeters)} m` }])" />
    <ShPanel v-if="stops.length" title="停留明细">
      <ElTable :data="stops" size="small" stripe>
        <ElTableColumn prop="startTime" label="开始" min-width="110" />
        <ElTableColumn prop="endTime" label="结束" min-width="110" />
        <ElTableColumn label="时长" align="right" min-width="96">
          <template #default="{ row }">{{ stopsDuration(row) }}</template>
        </ElTableColumn>
        <ElTableColumn label="位置" align="right" min-width="150">
          <template #default="{ row }">{{ fmt(row.latitude, 5) }}, {{ fmt(row.longitude, 5) }}</template>
        </ElTableColumn>
      </ElTable>
    </ShPanel>
    <p v-else class="sh-note">没有检测到符合条件的停留。</p>
  </div>

  <!-- classify_run -->
  <div v-else-if="view === 'classify'" class="sh-grid">
    <div class="sh-space">
      <ElTag :type="tag(d.type)" size="small" effect="light" round>{{ d.typeText ?? d.type ?? '未分类' }}</ElTag>
      <span class="sh-note">置信度 {{ d.confidence ?? '—' }}</span>
    </div>
    <ShKpi :items="kpiItems([
      { label: '距离', value: fmt(d.distanceKm), unit: 'km' },
      { label: '配速', value: d.paceText ?? '—' },
      { label: '个人中位配速', value: d.baselinePaceText ?? '—' },
      { label: '坡度修正配速', value: d.gradeAdjustedPaceText ?? '—' },
      { label: '配速标准差', value: `${fmt(d.paceStdDevSeconds)} 秒` }])" />
    <ShPanel title="配速对比" subtitle="相对个人中位配速">
      <BarList :items="classifyCompare" :format="fmtSeconds" unit="/km" />
    </ShPanel>
    <ShPanel v-if="reasons.length" title="判定理由">
      <ul style="margin: 0; padding-left: 18px; font-size: 12.5px; line-height: 1.7">
        <li v-for="(reason, index) in reasons" :key="index">{{ reason }}</li>
      </ul>
    </ShPanel>
  </div>

  <!-- compare_runs -->
  <div v-else-if="view === 'compare'" class="sh-grid">
    <ElAlert v-if="d.verdict" type="info" :closable="false" :title="d.verdict" />
    <div class="sh-split">
      <ShPanel
        v-for="side in [{ title: '基准跑', run: compareBase }, { title: '对比跑', run: compareOther }]"
        :key="side.title"
        :title="side.title"
        :subtitle="`${side.run.date ?? ''} · ${side.run.id ?? ''}`"
      >
        <ShKpi :items="kpiItems([
          { label: '距离', value: fmt(side.run.distanceKm), unit: 'km' },
          { label: '时长', value: side.run.durationText ?? fmtDuration(side.run.durationMinutes) },
          { label: '配速', value: side.run.paceText ?? '—' },
          { label: '爬升', value: fmt(side.run.climbMeters), unit: 'm' }])" />
      </ShPanel>
    </div>
    <ShPanel title="差异">
      <ShKpi :items="compareDiffs" />
    </ShPanel>
    <ShPanel v-if="compareBaseSplits.length || compareOtherSplits.length" title="分段对比"
      :subtitle="`每 ${compareSplitKm ?? '—'} km · 数值越低越快（坡度修正（GAP）已折算为平路配速）`">
      <div class="sh-split">
        <ShPanel title="基准跑分段">
          <ElTable :data="compareBaseSplits" size="small" stripe>
            <ElTableColumn label="公里" width="80">
              <template #default="{ row }">{{ fmt(row.fromKm) }}–{{ fmt(row.toKm) }}</template>
            </ElTableColumn>
            <ElTableColumn prop="paceText" label="配速" align="right" width="90" />
            <ElTableColumn prop="gradeAdjustedPaceText" label="坡度修正" width="95" />
          </ElTable>
        </ShPanel>
        <ShPanel title="对比跑分段">
          <ElTable :data="compareOtherSplits" size="small" stripe>
            <ElTableColumn label="公里" width="80">
              <template #default="{ row }">{{ fmt(row.fromKm) }}–{{ fmt(row.toKm) }}</template>
            </ElTableColumn>
            <ElTableColumn prop="paceText" label="配速" align="right" width="90" />
            <ElTableColumn prop="gradeAdjustedPaceText" label="坡度修正" width="95" />
          </ElTable>
        </ShPanel>
      </div>
      <p v-if="compareNoGps.length" class="sh-note">无 GPS 轨迹的记录：{{ compareNoGps.join('、') }}，分段列表为空。</p>
    </ShPanel>
  </div>

  <!-- reload_data -->
  <div v-else-if="view === 'reload'" class="sh-grid">
    <ShKpi :items="reloadKpis" />
    <p v-if="d.message" class="sh-note">{{ d.message }}</p>
  </div>

  <!-- get_run_summary_data：华为 summaryData 换算（这条记录带 summaryData 时本卡片更有价值） -->
  <div v-else-if="view === 'summaryData'" class="sh-grid">
    <ShKpi :items="summaryDataKpis" />
    <ShPanel title="换算字段">
      <ElDescriptions :column="2" size="small" border>
        <ElDescriptionsItem v-for="row in summaryDataRows" :key="row.label" :label="row.label">
          <span style="word-break: break-all">{{ row.value }}</span>
        </ElDescriptionsItem>
      </ElDescriptions>
    </ShPanel>
    <ShPanel v-if="summaryDataKmSplits.length" title="km 分段配速">
      <ElTable :data="summaryDataKmSplits" size="small" stripe>
        <ElTableColumn prop="endKm" label="终点公里" align="right" width="80" />
        <ElTableColumn prop="paceText" label="配速" align="right" width="90" />
        <ElTableColumn prop="cumulativeText" label="累计用时" align="right" width="90" />
        <ElTableColumn label="本段用时" align="right" width="80">
          <template #default="{ row }">{{ fmtDuration((row.durationSeconds ?? 0) / 60) }}</template>
        </ElTableColumn>
      </ElTable>
    </ShPanel>
    <p v-if="Array.isArray(d.notes) && d.notes.length" class="sh-note">{{ d.notes.join('；') }}</p>
  </div>

  <!-- get_run_streams：track_stream 目录（或按 type 取行） -->
  <div v-else-if="view === 'streams'" class="sh-grid">
    <ShKpi :items="kpiItems([
      { label: '流类型', value: streamMode ? (d.type ?? '—') : `${streamCatalog.length} 种` },
      { label: '总行数', value: streamMode ? (d.total ?? 0) : (d.totalRows ?? 0), unit: '行' },
      { label: '已返回', value: streamMode ? `${(d.rows ?? 0)}–${((d.offset ?? 0) + (d.rows ?? 0))}` : '—' },
    ]) " />
    <ShPanel v-if="!streamMode && streamCatalogRows.length" title="流目录" subtitle="先看有哪些流，再传 type 取行">
      <ElTable :data="streamCatalogRows" size="small" stripe>
        <ElTableColumn prop="type" label="类型" width="110" />
        <ElTableColumn prop="rows" label="行数" align="right" width="70" />
        <ElTableColumn prop="unit" label="单位" align="right" width="80" />
        <ElTableColumn prop="valueRange" label="值范围 min–avg–max" min-width="150" />
        <ElTableColumn prop="meaning" label="语义" min-width="160" />
      </ElTable>
    </ShPanel>
    <ShPanel v-if="!streamMode && streamSampleRows.length" title="首行样例">
      <ElTable :data="streamSampleRows" size="small" stripe>
        <ElTableColumn prop="type" label="类型" width="110" />
        <ElTableColumn prop="time" label="时刻" width="110" />
        <ElTableColumn prop="value" label="值" align="right" width="90" />
        <ElTableColumn prop="speedKmh" label="速度" align="right" width="80" />
        <ElTableColumn label="字段" min-width="120">
          <template #default="{ row }">{{ streamDetailFields(row) }}</template>
        </ElTableColumn>
      </ElTable>
    </ShPanel>
    <ShPanel v-if="streamMode && streamDetailRows.length" :title="`${d.type} 流行数据`" subtitle="逐行数值字段已转成数字">
      <ElTable :data="streamDetailRows" size="small" stripe>
        <ElTableColumn prop="seq" label="序号" width="60" />
        <ElTableColumn prop="time" label="时刻" width="110" />
        <ElTableColumn prop="value" label="值" align="right" width="90" />
        <ElTableColumn prop="paceText" label="配速" width="90" />
        <ElTableColumn prop="endDistanceMeters" label="段终点" align="right" width="90" />
        <ElTableColumn label="字段" min-width="120">
          <template #default="{ row }">{{ streamDetailFields(row) }}</template>
        </ElTableColumn>
      </ElTable>
    </ShPanel>
  </div>

  <!-- get_running_dynamics：跑姿与步幅 -->
  <div v-else-if="view === 'dynamics'" class="sh-grid">
    <ShKpi :items="dynamicsKpis" />
    <ShPanel v-if="dynamicsSegments.length" title="按公里分段" subtitle="跑姿采样 5 秒一个，插值到累计距离后归段">
      <Chart kind="bar" :data="dynamicsSegmentPoints" :format="fmtSeconds" :height="170" />
    </ShPanel>
    <ShPanel v-if="Object.keys(halvesDelta).length" title="前后半程差值" subtitle="后半程 − 前半程：疲劳后动作开始变形">
      <ShKpi :items="halfDeltaItems" />
    </ShPanel>
    <ShPanel v-if="dynamicsRuns.length" title="区间记录" subtitle="逐次跑步的均值跑姿">
      <ElTable :data="dynamicsRuns" size="small" stripe>
        <ElTableColumn prop="date" label="日期" width="92" />
        <ElTableColumn prop="distanceKm" label="距离" align="right" width="80" />
        <ElTableColumn prop="paceText" label="配速" align="right" width="90" />
        <ElTableColumn label="步频" align="right" width="80">
          <template #default="{ row }">{{ row.cadenceSpm ?? '—' }} 步/分</template>
        </ElTableColumn>
        <ElTableColumn label="触地时间" align="right" width="90">
          <template #default="{ row }">{{ row.groundContactTimeMs != null ? `${fmt(row.groundContactTimeMs)} ms` : '—' }}</template>
        </ElTableColumn>
      </ElTable>
    </ShPanel>
    <p v-if="dynamicsScope === 'range'" class="sh-note">这里是按区间汇总的逐次记录（single 模式看 segments/halves）。</p>
    <p v-for="(note, index) in d.notes ?? []" :key="index" class="sh-note">{{ note }}</p>
  </div>

  <!-- get_run_level：华为官方跑力 -->
  <div v-else-if="view === 'runLevel'" class="sh-grid">
    <ShKpi :items="runLevelKpis" />
    <ShPanel title="五档配速（A/E/I/M/R）">
      <ElTable :data="runLevelZones" size="small" stripe>
        <ElTableColumn prop="code" label="档位" width="60" />
        <ElTableColumn prop="name" label="档位名" width="90" />
        <ElTableColumn prop="paceText" label="配速" align="right" width="90" />
        <ElTableColumn prop="speedKmh" label="速度" align="right" width="80" />
      </ElTable>
    </ShPanel>
    <ShPanel title="官方成绩">
      <ElTable :data="runLevelTimes" size="small" stripe>
        <ElTableColumn prop="distanceKm" label="距离" align="right" width="80" />
        <ElTableColumn prop="timeText" label="成绩" align="right" width="90" />
        <ElTableColumn prop="paceText" label="配速" align="right" width="90" />
      </ElTable>
    </ShPanel>
    <ShPanel v-if="runLevelHistory.length" title="跑力趋势" subtitle="官方每日快照，跑力值按日提升">
      <Chart kind="line" :data="runLevelHistory" :color="C.purple" :height="120" />
    </ShPanel>
    <p v-if="d.text" class="sh-note">{{ d.text }}</p>
    <p v-if="d.note" class="sh-note">{{ d.note }}</p>
  </div>

  <!-- get_official_splits：华为官方分段 vs GPS 对照 -->
  <div v-else-if="view === 'officialSplits'" class="sh-grid">
    <ShKpi :items="officialKpis" />
    <ShPanel title="官方分段与 GPS 对照">
      <ElTable :data="officialSplitRows" size="small" stripe>
        <ElTableColumn prop="index" label="段序" width="60" />
        <ElTableColumn label="公里" width="80">
          <template #default="{ row }">{{ fmt(row.fromKm) }}–{{ fmt(row.toKm) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="paceText" label="官方配速" align="right" width="90" />
        <ElTableColumn prop="gpsPace" label="GPS 配速" align="right" width="90" />
        <ElTableColumn prop="delta" label="差值" align="right" width="90" />
        <ElTableColumn prop="cumulativeDelta" label="累计差" align="right" width="90" />
      </ElTable>
    </ShPanel>
    <p v-if="officialCompare?.verdict" class="sh-note">{{ officialCompare.verdict }}</p>
    <p v-if="d.message" class="sh-note">{{ d.message }}</p>
  </div>

  <!-- sync_weather：天气补齐 -->
  <div v-else-if="view === 'syncWeather'" class="sh-grid">
    <ShKpi :items="syncKpis" />
    <ShPanel v-if="syncProblems.length" title="问题明细">
      <ElTable :data="syncProblems" size="small" stripe>
        <ElTableColumn prop="runId" label="记录" width="120" />
        <ElTableColumn prop="reason" label="原因" min-width="140" />
        <ElTableColumn prop="retriedAt" label="重试时间" width="110" />
      </ElTable>
    </ShPanel>
    <p v-if="d.message" class="sh-note">{{ d.message }}</p>
    <ShPanel v-if="d.coverage" title="天气覆盖率" subtitle="有天气 / 无数据 / 覆盖率">
      <ShKpi :items="kpiItems([
        { label: '跑步记录', value: d.coverage.totalRuns ?? 0, unit: '条' },
        { label: '已有天气', value: d.coverage.ok ?? 0, unit: '条' },
        { label: '无数据', value: d.coverage.unavailable ?? 0, unit: '条' },
        { label: '覆盖率', value: d.coverage.coveragePercent, unit: '%' },
        { label: '最近回填', value: d.coverage.lastFetchedAt ?? '—' },
      ])" />
    </ShPanel>
  </div>

  <!-- get_heart_rate_series：动态心率 -->
  <div v-else-if="view === 'heartRate'" class="sh-grid">
    <ShKpi :items="hrKpis" />
    <ShPanel v-if="hrBuckets.length" title="心率曲线" subtitle="按时间分桶的平均心率">
      <Chart kind="line" :data="hrBucketPoints" :color="C.red" :height="170" />
    </ShPanel>
    <ShPanel v-if="hrActivities.length" title="当天运动" subtitle="华为分析进行段">
      <ElTable :data="hrActivities" size="small" stripe>
        <ElTableColumn prop="sport" label="项目" width="80" />
        <ElTableColumn label="时段" width="170">
          <template #default="{ row }">{{ row.start }}–{{ row.end }}</template>
        </ElTableColumn>
        <ElTableColumn prop="distanceKm" label="距离" align="right" width="80" />
        <ElTableColumn prop="avgHeartRate" label="平均心率" align="right" width="90" />
        <ElTableColumn prop="maxHeartRate" label="最高心率" align="right" width="90" />
      </ElTable>
    </ShPanel>
    <p v-for="note in d.notes ?? []" :key="note" class="sh-note">{{ note }}</p>
  </div>

  <!-- get_sleep_summary：睡眠概览 -->
  <div v-else-if="view === 'sleepSummary'" class="sh-grid">
    <ShKpi :items="sleepKpis" />
    <ShPanel title="睡眠分期" subtitle="day：逐夜；week/month：按周期聚合（avgX 口径）">
      <ElTable :data="sleepRows" size="small" stripe>
        <ElTableColumn prop="label" label="夜晚/周期" min-width="80" />
        <ElTableColumn prop="bedtime" label="入睡" width="110" />
        <ElTableColumn prop="waketime" label="起床" width="110" />
        <ElTableColumn prop="timeInBed" label="卧床" width="80" />
        <ElTableColumn prop="asleepText" label="睡着" width="80" />
        <ElTableColumn prop="deep" label="深睡" width="70" />
        <ElTableColumn prop="light" label="浅睡" width="70" />
        <ElTableColumn prop="rem" label="快速眼动" width="80" />
        <ElTableColumn prop="awake" label="清醒" width="70" />
        <ElTableColumn prop="wakes" label="醒来" width="70" />
        <ElTableColumn prop="score" label="评分" width="70" />
        <ElTableColumn prop="efficiency" label="效率" width="70" />
      </ElTable>
    </ShPanel>
    <ShPanel v-if="d.coverage" title="数据覆盖" :subtitle="d.coverage.note">
      <ShKpi :items="kpiItems([
        { label: '夜数', value: d.coverage.nights, unit: '夜' },
        { label: '有分期', value: d.coverage.sessionDays, unit: '夜' },
        { label: '有报告', value: d.coverage.reportDays, unit: '夜' },
        { label: '只有分期', value: d.coverage.stageOnlyNights, unit: '夜' },
        { label: '有血氧', value: d.coverage.spo2Nights, unit: '夜' },
      ])" />
    </ShPanel>
  </div>

  <!-- get_sleep_detail：睡眠详情 -->
  <div v-else-if="view === 'sleepDetail'" class="sh-grid">
    <ShKpi :items="sleepDetailKpis" />
    <ShPanel v-if="sleepStagesPresent" title="各阶段时长" subtitle="深睡/浅睡/快速眼动/清醒">
      <Chart kind="bar" :data="sleepStagePoints" :height="150" />
    </ShPanel>
    <ShPanel v-if="sleepTimeline.length" title="分期时间线" subtitle="按时间拼接的睡眠阶段">
      <Chart kind="line" :data="sleepTimelinePoints" :color="C.purple" :height="130" />
    </ShPanel>
    <ShPanel v-if="sleepWakeEpisodes.length" title="醒来时刻">
      <ElTable :data="sleepWakeEpisodes" size="small" stripe>
        <ElTableColumn label="开始" width="110"><template #default="{ row }">{{ row.start.slice(11, 16) }}</template></ElTableColumn>
        <ElTableColumn label="结束" width="110"><template #default="{ row }">{{ row.end.slice(11, 16) }}</template></ElTableColumn>
        <ElTableColumn prop="minutes" label="时长" align="right" width="70" />
      </ElTable>
    </ShPanel>
    <ShPanel v-if="sleepFragments?.available" title="睡眠碎片" subtitle="设备眼中的连续块与间隙">
      <ShKpi :items="kpiItems([
        { label: '碎片块数', value: sleepFragments.count, unit: '块' },
        { label: '最长一块', value: sleepFragments.longestMinutes, unit: '分' },
        { label: '平均块长', value: sleepFragments.averageMinutes, unit: '分' },
        { label: '块间空隙', value: sleepFragments.gapMinutes, unit: '分' },
      ])" />
    </ShPanel>
    <p v-for="note in d.notes ?? []" :key="note" class="sh-note">{{ note }}</p>
  </div>

  <!-- get_sleep_trend：睡眠趋势 -->
  <div v-else-if="view === 'sleepTrend'" class="sh-grid">
    <ShKpi :items="sleepTrendKpis" />
    <ShPanel v-if="sleepTrendLine.length" :title="`${d.groupBy === 'month' ? '月度' : '周度'}睡眠趋势`" subtitle="拟合方向与 r² 在指标行里">
      <Chart kind="line" :data="sleepTrendLine" :color="C.green" :height="150" />
    </ShPanel>
    <p v-for="note in d.notes ?? []" :key="note" class="sh-note">{{ note }}</p>
  </div>

  <!-- get_recovery_status：恢复状态 -->
  <div v-else-if="view === 'recovery'" class="sh-grid">
    <ShKpi :items="recoveryKpis" />
    <ShPanel v-if="recoveryTraining.recommendation" title="恢复建议">
      <p class="sh-note">{{ recoveryTraining.recommendation }}</p>
    </ShPanel>
    <ShPanel v-if="d.coverage" title="覆盖率" subtitle="用于判断 ACWR 结论的可信度">
      <ShKpi :items="kpiItems([
        { label: '睡眠夜数', value: d.coverage.sleepNights, unit: '夜' },
        { label: '体征天数', value: d.coverage.vitalsDays, unit: '天' },
        { label: '训练天数', value: d.coverage.acuteTrainingDays, unit: '天' },
      ])" />
    </ShPanel>
    <p v-if="d.summary" class="sh-note">{{ d.summary }}</p>
  </div>

  <!-- get_daily_vitals：每日体征 -->
  <div v-else-if="view === 'vitals'" class="sh-grid">
    <ShKpi :items="vitalsKpis" />
    <ShPanel v-if="vitalsMetricRows.length" title="指标统计" subtitle="区间均值/最低/最高；方向与评估在 notes 里解释口径">
      <ElTable :data="vitalsMetricRows" size="small" stripe>
        <ElTableColumn prop="key" label="指标" min-width="90" />
        <ElTableColumn prop="unit" label="单位" width="70" />
        <ElTableColumn prop="average" label="均值" align="right" width="80" />
        <ElTableColumn prop="min" label="最低" align="right" width="80" />
        <ElTableColumn prop="max" label="最高" align="right" width="80" />
        <ElTableColumn prop="count" label="有值天数" align="right" width="90" />
        <ElTableColumn prop="direction" label="方向" align="right" width="70" />
        <ElTableColumn prop="assessment" label="评估" align="right" width="80" />
      </ElTable>
    </ShPanel>
    <ShPanel v-if="vitalsDays.length" title="逐日（groupBy=day）">
      <ElTable :data="vitalsDays" size="small" stripe>
        <ElTableColumn prop="date" label="日期" width="92" />
        <ElTableColumn prop="restingHeartRate" label="静息心率" align="right" width="90" />
        <ElTableColumn prop="hrvRmssd" label="HRV RMSSD" align="right" width="90" />
        <ElTableColumn prop="stressAverage" label="压力均值" align="right" width="80" />
        <ElTableColumn prop="stressMax" label="压力峰值" align="right" width="80" />
        <ElTableColumn prop="vo2max" label="VO2max" align="right" width="90" />
        <ElTableColumn prop="averageHeartRate" label="全天平均心率" align="right" width="90" />
      </ElTable>
    </ShPanel>
    <ShPanel v-if="vitalsPeriods.length" title="按周期聚合（groupBy=week/month）">
      <ElTable :data="vitalsPeriods" size="small" stripe>
        <ElTableColumn prop="period" label="周期" width="80" />
        <ElTableColumn prop="from" label="起点" width="92" />
        <ElTableColumn prop="to" label="终点" width="92" />
        <ElTableColumn prop="restingHeartRate" label="静息心率" align="right" width="90" />
        <ElTableColumn prop="hrv" label="HRV" align="right" width="90" />
        <ElTableColumn prop="stress" label="压力" align="right" width="80" />
      </ElTable>
    </ShPanel>
    <p v-for="note in d.notes ?? []" :key="note" class="sh-note">{{ note }}</p>
  </div>

  <!-- get_hrv_trend：HRV 趋势 -->
  <div v-else-if="view === 'hrvTrend'" class="sh-grid">
    <ShKpi :items="hrvTrendKpis" />
    <ShPanel v-if="hrvLine.length" title="HRV 趋势" subtitle="睡眠窗口内的 RMSSD 均值，按起床日归属">
      <Chart kind="line" :data="hrvLine" :color="C.green" :height="150" />
    </ShPanel>
    <p v-for="note in d.notes ?? []" :key="note" class="sh-note">{{ note }}</p>
  </div>

  <!-- get_stress_series：压力曲线 -->
  <div v-else-if="view === 'stress'" class="sh-grid">
    <ShKpi :items="stressKpis" />
    <ShPanel title="压力曲线" subtitle="压力分 0~100；档位 0~29 放松 / 30~59 正常 / 60~79 中等 / 80~100 高压">
      <Chart kind="line" :data="stressBuckets" :color="C.amber" :height="170" />
    </ShPanel>
    <ShPanel v-if="stressLevels.length" title="档位样本分布">
      <BarList :items="stressLevels" :format="v => `${fmt(v)} 样本`" />
    </ShPanel>
    <p v-for="note in d.notes ?? []" :key="note" class="sh-note">{{ note }}</p>
  </div>

  <!-- get_blood_oxygen：血氧记录 -->
  <div v-else-if="view === 'bloodOxygen'" class="sh-grid">
    <ShKpi :items="spo2Kpis" />
    <ShPanel title="每日血氧（%）" subtitle="最低/平均/最高与当日低于 95% 样本数">
      <ElTable :data="spo2Daily" size="small" stripe>
        <ElTableColumn prop="date" label="日期" width="92" />
        <ElTableColumn prop="samples" label="样本数" align="right" width="70" />
        <ElTableColumn prop="min" label="最低" align="right" width="70" />
        <ElTableColumn prop="average" label="平均" align="right" width="70" />
        <ElTableColumn prop="max" label="最高" align="right" width="70" />
        <ElTableColumn prop="below95" label="低于 95%" align="right" width="90" />
      </ElTable>
    </ShPanel>
    <ShPanel v-if="spo2LowEvents.length" title="设备低氧提醒" subtitle="SpO2 低于 90% 的设备自己下发提醒">
      <ElTable :data="spo2LowEvents" size="small" stripe>
        <ElTableColumn prop="time" label="时刻" width="80" />
        <ElTableColumn prop="value" label="血氧" align="right" width="70" />
        <ElTableColumn prop="threshold" label="阈值" align="right" width="70" />
      </ElTable>
    </ShPanel>
    <ShPanel v-if="spo2Samples.length" title="明细样本" subtitle="截断默认返回">
      <Chart kind="line" :data="spo2Samples" :color="C.green" :height="130" />
    </ShPanel>
    <p v-for="note in d.notes ?? []" :key="note" class="sh-note">{{ note }}</p>
  </div>

  <!-- get_daily_activity：日常活动量 -->
  <div v-else-if="view === 'activity'" class="sh-grid">
    <ShKpi :items="activityKpis" />
    <ShPanel title="日常活动量（步数）" subtitle="每天走了多少步；同分钟双记录会重复计">
      <Chart kind="bar" :data="activityDaysPoints" :color="C.green" :height="170" />
    </ShPanel>
    <ShPanel v-if="activityGoals" title="目标达成" subtitle="8000 步 / 30 分 / 12 次 / 周 150 分（WHO）">
      <ShKpi :items="kpiItems([
        { label: '步数日目标', value: activityGoals.stepsPerDay, unit: '步' },
        { label: '中高强度日目标', value: activityGoals.activeMinutesPerDay, unit: '分' },
        { label: '站立次数日目标', value: activityGoals.standEventsPerDay, unit: '次' },
        { label: '末 7 天中高强度', value: activityGoals.weeklyActiveMinutes, unit: '分' },
        { label: '周线达标', value: activityGoals.weeklyActiveMinutesMet ? '是' : '否', tone: activityGoals.weeklyActiveMinutesMet ? C.green : C.red },
      ])" />
    </ShPanel>
    <ShPanel v-if="activityTrends.length" title="最近 7 天 vs 前 7 天">
      <ElTable :data="activityTrends" size="small" stripe>
        <ElTableColumn prop="label" label="指标" width="80" />
        <ElTableColumn prop="unit" label="单位" width="60" />
        <ElTableColumn prop="recent" label="最近均值" align="right" width="80" />
        <ElTableColumn prop="previous" label="前 7 天均值" align="right" width="90" />
        <ElTableColumn prop="changePercent" label="变化 %" align="right" width="80">
          <template #default="{ row }">{{ row.changePercent != null ? signed(row.changePercent, 1) : '—' }}</template>
        </ElTableColumn>
        <ElTableColumn prop="direction" label="方向" align="right" width="70" />
      </ElTable>
    </ShPanel>
    <p v-for="note in d.notes ?? []" :key="note" class="sh-note">{{ note }}</p>
  </div>

  <!-- get_activity_minutes：分钟级活动 -->
  <div v-else-if="view === 'activityMinutes'" class="sh-grid">
    <ShKpi :items="activityMinutesKpis" />
    <ShPanel v-if="activityMinutesTypes.length" title="分类型合计">
      <ElTable :data="activityMinutesTypes" size="small" stripe>
        <ElTableColumn prop="type" label="类型" width="80" />
        <ElTableColumn prop="label" label="中文名" width="80" />
        <ElTableColumn prop="minutes" label="分钟" align="right" width="70" />
        <ElTableColumn prop="steps" label="步数" align="right" width="80" />
        <ElTableColumn prop="distanceKm" label="距离" align="right" width="80" />
        <ElTableColumn prop="firstTime" label="开始" width="80" />
        <ElTableColumn prop="lastTime" label="结束" width="80" />
      </ElTable>
    </ShPanel>
    <ShPanel v-if="activityMinutesBlocks.length" title="连续段（同类型、前后相差 ≤2 分钟）">
      <ElTable :data="activityMinutesBlocks" size="small" stripe>
        <ElTableColumn prop="label" label="类型" width="80" />
        <ElTableColumn label="时段" width="170">
          <template #default="{ row }">{{ row.from }}–{{ row.to }}</template>
        </ElTableColumn>
        <ElTableColumn prop="minutes" label="分钟" align="right" width="70" />
        <ElTableColumn prop="steps" label="步数" align="right" width="80" />
      </ElTable>
    </ShPanel>
    <ShPanel v-if="activityMinutesRows.length" title="逐分钟明细">
      <Chart kind="bar" :data="activityMinutesPoints" :color="C.green" :height="120" />
    </ShPanel>
    <p v-for="note in d.notes ?? []" :key="note" class="sh-note">{{ note }}</p>
  </div>

  <!-- get_weekly_health_report：周健康报告 -->
  <div v-else-if="view === 'weeklyReport'" class="sh-grid">
    <ShKpi :items="weeklyKpis" />
    <p v-if="d.text" class="sh-note">{{ d.text }}</p>
    <p v-if="d.range" class="sh-note">{{ d.range }}</p>
  </div>

  <!-- get_medals：体育勋章 -->
  <div v-else-if="view === 'medals'" class="sh-grid">
    <ShKpi :items="kpiItems([{ label: '勋章数', value: medals.length, unit: '枚' }])" />
    <ShPanel v-if="medals.length" title="体育勋章">
      <ElTable :data="medals" size="small" stripe>
        <ElTableColumn prop="medalType" label="类型" width="90" />
        <ElTableColumn prop="medalLevel" label="等级" width="90" />
        <ElTableColumn prop="gainCount" label="获得次数" align="right" width="90" />
        <ElTableColumn prop="takeDate" label="最近获得" width="110" />
        <ElTableColumn prop="modifyTime" label="最近修改" width="110" />
      </ElTable>
    </ShPanel>
    <p v-if="d.hasMore" class="sh-note">返回只有前 100 枚，可用 medalType / medalLevel 过滤。</p>
  </div>

  <!-- get_ecg_records：ECG 记录 -->
  <div v-else-if="view === 'ecgRecords'" class="sh-grid">
    <ShKpi :items="kpiItems([
      { label: 'ECG 记录', value: ecgRecords.length, unit: '条' },
      { label: '平均心率', value: ecgRecords.length ? fmt(ecgRecords[0].averageHeartRate) : undefined, unit: 'bpm' },
    ])" />
    <ShPanel v-if="ecgRecords.length" title="ECG 记录">
      <ElTable :data="ecgRecords" size="small" stripe>
        <ElTableColumn prop="recordId" label="recordId" min-width="80" />
        <ElTableColumn prop="startTime" label="开始" width="110" />
        <ElTableColumn prop="endTime" label="结束" width="110" />
        <ElTableColumn prop="averageHeartRate" label="平均心率" align="right" width="90" />
        <ElTableColumn prop="ecgArrhyType" label="心律失常类型" align="right" width="110" />
        <ElTableColumn prop="ecgDataLength" label="数据长度" align="right" width="90" />
        <ElTableColumn prop="detailSampleCount" label="detail 采样" align="right" width="90" />
        <ElTableColumn prop="extendSampleCount" label="extend 采样" align="right" width="90" />
      </ElTable>
    </ShPanel>
  </div>

  <!-- get_sample_sequences：样本序列元数据 -->
  <div v-else-if="view === 'sampleSequences'" class="sh-grid">
    <ShKpi :items="kpiItems([
      { label: '样本记录', value: sampleSequences.length, unit: '条' },
      { label: '区间总计', value: d.totalInRange ?? d.total ?? 0, unit: '条' },
    ])" />
    <ShPanel v-if="sampleSequences.length" title="样本序列（仅元数据）">
      <ElTable :data="sampleSequences" size="small" stripe>
        <ElTableColumn prop="recordId" label="recordId" min-width="80" />
        <ElTableColumn prop="typeCode" label="类型码" align="right" width="90" />
        <ElTableColumn prop="dataId" label="dataId" align="right" width="90" />
        <ElTableColumn prop="subType" label="子类型" align="right" width="70" />
        <ElTableColumn prop="startTime" label="开始" width="110" />
        <ElTableColumn prop="endTime" label="结束" width="110" />
        <ElTableColumn prop="timeZone" label="时区" width="60" />
        <ElTableColumn prop="deviceCode" label="设备" width="70" />
      </ElTable>
    </ShPanel>
  </div>

  <!-- get_body_composition：体成分 -->
  <div v-else-if="view === 'bodyComposition'" class="sh-grid">
    <template v-if="bodyMode === 'configs'">
      <ShKpi :items="kpiItems([
        { label: '配置套数', value: d.profileCount ?? 0, unit: '套' },
        { label: '称重记录', value: d.measurementCount ?? 0, unit: '条' },
      ])" />
      <ShPanel v-if="bodyConfigs.length" title="体脂秤配置（一台秤的多用户数据）">
        <ElTable :data="bodyConfigs" size="small" stripe>
          <ElTableColumn prop="label" label="配置" width="95" />
          <ElTableColumn prop="measurements" label="条数" align="right" width="70" />
          <ElTableColumn prop="bodyComposition" label="带体成分" align="right" width="80" />
          <ElTableColumn label="体重区间" align="right" width="110">
            <template #default="{ row }">{{ fmt(row.weightMin, 1) }} – {{ fmt(row.weightMax, 1) }} kg</template>
          </ElTableColumn>
          <ElTableColumn prop="firstDate" label="首次" width="80" />
          <ElTableColumn prop="lastDate" label="最近" width="80" />
        </ElTable>
      </ShPanel>
      <p v-for="note in d.notes ?? []" :key="note" class="sh-note">{{ note }}</p>
    </template>
    <template v-else>
      <ShKpi :items="bodyMeasureKpis" />
      <ShPanel v-if="bodyMeasurementRows.length" title="称重明细（按时间升序）">
        <ElTable :data="bodyMeasurementRows" size="small" stripe>
          <ElTableColumn prop="date" label="日期" width="80" />
          <ElTableColumn prop="time" label="时间" width="60" />
          <ElTableColumn prop="weightKg" label="体重" align="right" width="70" />
          <ElTableColumn prop="bmi" label="BMI" align="right" width="70" />
          <ElTableColumn prop="bodyFatPercent" label="体脂率" align="right" width="70" />
          <ElTableColumn prop="muscleMassKg" label="肌肉量" align="right" width="70" />
          <ElTableColumn prop="bodyWaterPercent" label="体水分" align="right" width="70" />
          <ElTableColumn prop="visceralFatLevel" label="内脏脂肪" align="right" width="70" />
          <ElTableColumn prop="waistHipRatio" label="腰臀比" align="right" width="70" />
          <ElTableColumn prop="basalMetabolismKcal" label="基础代谢" align="right" width="90" />
          <ElTableColumn prop="bodyAge" label="体年龄" align="right" width="60" />
        </ElTable>
      </ShPanel>
      <ShPanel v-if="bodyTrendRows.length" title="区间变化">
        <ElTable :data="bodyTrendRows" size="small" stripe>
          <ElTableColumn prop="key" label="指标" min-width="80" />
          <ElTableColumn prop="unit" label="单位" width="60" />
          <ElTableColumn prop="first" label="首条" align="right" width="80" />
          <ElTableColumn prop="last" label="末条" align="right" width="80" />
          <ElTableColumn prop="change" label="变化" align="right" width="80" />
          <ElTableColumn prop="changePercent" label="变化率" align="right" width="80">
            <template #default="{ row }">{{ row.changePercent != null ? signed(row.changePercent, 1) : '—' }}%</template>
          </ElTableColumn>
        </ElTable>
      </ShPanel>
      <ShPanel v-if="bodyMonthly.length" title="按月均值" subtitle="长期趋势看更快">
        <Chart kind="line" :data="bodyMonthlyPoints" :color="C.accent" :height="130" />
      </ShPanel>
      <p v-if="bodyProfile.label" class="sh-note">{{ bodyProfile.label }} · {{ d.range }} · {{ d.count }} 条</p>
      <p v-for="note in d.notes ?? []" :key="note" class="sh-note">{{ note }}</p>
    </template>
  </div>

  <!-- fallback -->
  <div v-else class="sh-grid">
    <ShKpi v-if="genericEntries.length" :items="genericEntries" />
    <p v-if="d && d.text" class="sh-note">{{ d.text }}</p>
    <p v-if="!genericEntries.length && !(d && d.text)" class="sh-note">{{ typeof d === 'string' ? d : '没有可展示的结构化字段。' }}</p>
  </div>
</template>
