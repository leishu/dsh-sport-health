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
const [rangeFrom, rangeTo] = splitRange(range.value)

/* ── get_personal_bests ────────────────────────────────────────────────── */

const BEST_SPECS: Array<{ key: string; label: string; value: (b: any) => string; hint: (b: any) => string }> = [
  { key: 'longestDistance', label: '最长距离', value: b => `${fmt(b.distanceKm)} km`, hint: b => `${b.date} · ${b.durationText}` },
  { key: 'fastestPace', label: '最快配速', value: b => b.paceText, hint: b => `${b.date} · ${fmt(b.distanceKm)} km` },
  { key: 'longestDuration', label: '最长时长', value: b => b.durationText, hint: b => `${b.date} · ${fmt(b.distanceKm)} km` },
  { key: 'mostClimb', label: '最大爬升', value: b => `${fmt(b.climbMeters)} m`, hint: b => `${b.date} · ${fmt(b.distanceKm)} km` },
  { key: 'best1k', label: '最佳 1K', value: b => b.durationText, hint: b => `${b.paceText} · ${b.date}` },
  { key: 'best5k', label: '最佳 5K', value: b => b.durationText, hint: b => `${b.paceText} · ${b.date}` },
]
const bests = computed(() => d.value.bests ?? {})
const bestKpis = computed(() => BEST_SPECS
  .filter(spec => bests.value[spec.key] !== null && bests.value[spec.key] !== undefined)
  .map(spec => ({ label: spec.label, value: spec.value(bests.value[spec.key]), hint: spec.hint(bests.value[spec.key]) })))

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

/* ── get_run_splits ────────────────────────────────────────────────────── */

const splits = computed<any[]>(() => (Array.isArray(d.value.splits) ? d.value.splits : []))
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
  </div>

  <!-- reload_data -->
  <div v-else-if="view === 'reload'" class="sh-grid">
    <ShKpi :items="reloadKpis" />
    <p v-if="d.message" class="sh-note">{{ d.message }}</p>
  </div>

  <!-- fallback -->
  <div v-else class="sh-grid">
    <ShKpi v-if="genericEntries.length" :items="genericEntries" />
    <p v-if="d && d.text" class="sh-note">{{ d.text }}</p>
    <p v-if="!genericEntries.length && !(d && d.text)" class="sh-note">{{ typeof d === 'string' ? d : '没有可展示的结构化字段。' }}</p>
  </div>
</template>
