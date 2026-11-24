/**
 * Standalone "运动健康" conversation view.
 *
 * Talks to the host half's same-origin read-only proxy at
 * `/sport-health/api/*`. Both the Web app and the Desktop shell forward
 * application-origin requests to the Host, so no absolute URL or token is
 * needed. When the MCP server or the proxy is unavailable the view explains
 * how to recover instead of failing the conversation.
 */
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElAlert, ElButton, ElSkeleton, ElTable, ElTableColumn, ElTag } from './element.ts'
import ThemeProvider from './ThemeProvider.vue'
import { ShPanel } from './Kit.vue'
import ShKpi from './Kit.vue'
import Chart from './Chart.vue'
import Heatmap from './Heatmap.vue'
import { C, RISK_TEXT, RISK_TONE, tagType } from '../lib/theme.ts'
import {
  distanceLabel, fmt, fmtDuration, fmtPace, fmtPaceDelta, raceName, shortDate, signed,
} from '../lib/format.ts'
import { splitRange } from '../lib/payload.ts'

interface Overview {
  ok: boolean
  generatedAt?: string
  url?: string
  summary?: any
  daily?: any
  mix?: any
  consistency?: any
  load?: any
  bests?: any
  weather?: any
  runs?: any
  trend?: any
  predictions?: any
  sleepSummary?: any
  sleepTrend?: any
  recovery?: any
  vitals?: any
  hrv?: any
  stress?: any
  bloodOxygen?: any
  activity?: any
  activityMinutes?: any
  heartRate?: any
  bodyComposition?: any
  weeklyReport?: any
  medals?: any
  ecg?: any
  runLevel?: any
  dynamics?: any
  officialSplits?: any
  errors?: Array<{ tool: string; message: string }>
  error?: string
}

const data = ref<Overview | null>(null)
const loading = ref(true)
const fatal = ref<string | null>(null)
let controller: AbortController | null = null

async function load(): Promise<void> {
  controller?.abort()
  // 本次请求自己的 controller。`finally` 里必须读这个局部变量 —— 模块级的
  // `controller` 已被下一次调用替换，拿着它判断会让被 abort 的那次请求误以为
  // 「没被取消」，从而把还在飞的新请求的 loading 提前关掉。
  const current = new AbortController()
  controller = current
  loading.value = true
  fatal.value = null
  try {
    const response = await fetch('/sport-health/api/overview', {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: current.signal,
    })
    if (!response.ok) throw new Error(`看板接口返回 HTTP ${response.status}`)
    const next = await response.json() as Overview
    data.value = next
    if (next.ok === false && next.error) fatal.value = next.error
  } catch (error) {
    if ((error as any)?.name === 'AbortError') return
    if (current.signal.aborted) return
    fatal.value = error instanceof Error ? error.message : String(error)
    data.value = null
  } finally {
    if (!current.signal.aborted) loading.value = false
  }
}

onMounted(() => { void load() })
onBeforeUnmount(() => controller?.abort())

const summary = computed(() => data.value?.summary?.summary ?? data.value?.summary)
const range = computed<string | undefined>(() => data.value?.consistency?.range
  ?? (summary.value?.from && summary.value?.to ? `${summary.value.from} ~ ${summary.value.to}` : undefined))
const from = computed(() => splitRange(range.value)[0])
const to = computed(() => splitRange(range.value)[1])
const offline = computed(() => data.value === null || (data.value.ok === false && !data.value.summary))

/**
 * 面板为空时的说明。
 *
 * 工具真的报错就把错误带出来（否则用户只看到一句「暂无数据」，分不清是没
 * 有数据还是接口挂了）；没报错就退回到该面板自己的空态文案。
 */
function missingNote(tool: string, fallback: string): string {
  if (!data.value) return '加载中…'
  if (data.value.ok === false) return '暂不可用：无法连接 sport-health MCP 服务'
  const hit = (Array.isArray(data.value.errors) ? data.value.errors : []).find(item => item?.tool === tool)
  return hit ? `暂不可用：${hit.message}` : fallback
}

const dailyGroups = computed<any[]>(() => (Array.isArray(data.value?.daily?.groups) ? data.value!.daily.groups : []))
const mixTypes = computed<any[]>(() => (Array.isArray(data.value?.mix?.types) ? data.value!.mix.types : []))
const consistency = computed(() => data.value?.consistency)
const loadStats = computed(() => data.value?.load)
const bests = computed(() => data.value?.bests?.bests ?? {})
const runs = computed<any[]>(() => (Array.isArray(data.value?.runs?.runs) ? data.value!.runs.runs : []))

const dailyPoints = computed(() => dailyGroups.value.map(group => ({
  label: shortDate(group.label ?? group.from) ?? '',
  value: group.distanceKm ?? 0,
})))
const mixSlices = computed(() => mixTypes.value.map(type => ({ label: type.typeText ?? type.type, value: type.distanceKm ?? 0 })))
const mixTotal = computed(() => mixTypes.value.reduce((sum, type) => sum + (type.distanceKm ?? 0), 0))
const riskTone = computed(() => RISK_TONE[loadStats.value?.riskLevel] ?? C.amber)
const riskLabel = computed(() => RISK_TEXT[loadStats.value?.riskLevel] ?? loadStats.value?.riskLevel ?? '—')

const bestCards = computed(() => {
  const b = bests.value
  return [
    b.longestDistance && { label: '最长距离', value: `${fmt(b.longestDistance.distanceKm)} km`, hint: b.longestDistance.date },
    b.fastestPace && { label: '最快配速', value: b.fastestPace.paceText, hint: b.fastestPace.date },
    b.best1k && { label: '最佳 1K', value: b.best1k.durationText, hint: b.best1k.paceText },
    b.best5k && { label: '最佳 5K', value: b.best5k.durationText, hint: b.best5k.paceText },
  ].filter(Boolean) as Array<{ label: string; value: string; hint?: string }>
})

/* ── 周趋势（get_training_trend，从 overview 取最近 8 周） ─────────────── */

const trendPeriods = computed<any[]>(() => (Array.isArray(data.value?.trend?.periods) ? data.value!.trend.periods : []))
/** 只画有记录的周：空周会把柱状图压成一条线，也让环比失去参照。 */
const trendPoints = computed(() => trendPeriods.value
  .filter(period => (period.runCount ?? 0) > 0)
  .map(period => ({ label: shortDate(period.from) ?? '', value: period.distanceKm ?? 0, meta: `${period.runCount} 次` })))
const trendAvailable = computed(() => trendPoints.value.length >= 2)

/**
 * 「本周」取最近一个**已结束**的周期。
 *
 * 直接取最后一个有记录的周会踩坑：时间轴末端的周只过了一两天，拿半周去比
 * 完整的上周，环比必然显示成暴跌（实测 15.5 vs 22.9 → −32%，其实只是还没跑）。
 * 所以以「今天」为准跳过未结束的周期，比较的双方都是完整周。
 */
const trendComplete = computed<any[]>(() => {
  const today = new Date().toISOString().slice(0, 10)
  return trendPeriods.value.filter(period => (period.runCount ?? 0) > 0 && (period.to ?? '') < today)
})
const trendLatest = computed<any | undefined>(() => trendComplete.value.at(-1))
const trendPrevious = computed<any | undefined>(() => trendComplete.value.at(-2))

/** 进行中的周单独标注，用来解释「为什么图上最后一根柱子没出现在对比里」。 */
const trendOngoing = computed<any | undefined>(() => {
  const today = new Date().toISOString().slice(0, 10)
  return trendPeriods.value.filter(period => (period.runCount ?? 0) > 0 && (period.to ?? '') >= today).at(-1)
})

interface TrendDelta { label: string; value: string; tone?: string; hint?: string }

const trendDeltas = computed<TrendDelta[]>(() => {
  const latest = trendLatest.value
  if (!latest) return []
  const previous = trendPrevious.value
  const items: TrendDelta[] = [{
    label: '上周跑量',
    value: `${fmt(latest.distanceKm)} km`,
    tone: C.accent,
    hint: latest.label,
  }]

  if (previous) {
    const ramp = percentOf(latest.distanceKm, previous.distanceKm)
    if (ramp !== null) {
      items.push({
        label: '较前一周',
        value: `${signed(ramp)}%`,
        tone: toneForRamp(ramp),
        hint: `${fmt(previous.distanceKm)} km → ${fmt(latest.distanceKm)} km`,
      })
    }

    const paceGap = latest.paceSecondsPerKm && previous.paceSecondsPerKm
      ? latest.paceSecondsPerKm - previous.paceSecondsPerKm
      : null
    if (paceGap !== null) {
      items.push({
        label: '配速变化',
        value: fmtPaceDelta(paceGap),
        // 跑步语境里快慢不带涨跌含义，这里「更快=绿、更慢=琥珀」表达有利/不利，
        // 与跑量增幅的配色语义一致。
        tone: paceGap < 0 ? C.green : paceGap > 0 ? C.amber : C.slate,
        hint: `${previous.paceText ?? '—'} → ${latest.paceText ?? '—'}`,
      })
    }
  }

  items.push({
    label: '上周次数',
    value: `${latest.runCount ?? 0}`,
    tone: C.purple,
    hint: latest.paceText ?? undefined,
  })
  return items
})

/**
 * 进行中的那一周的提示。它不进对比（见 `trendComplete`），但用户会在图上
 * 看到这根柱子，所以必须说清楚它是什么。
 */
const trendOngoingNote = computed(() => {
  const week = trendOngoing.value
  if (!week || !trendLatest.value) return undefined
  return `本周进行中：已跑 ${week.runCount ?? 0} 次 ${fmt(week.distanceKm)} km，未计入环比`
})

/** 趋势图空态：区分「数据段没返回」和「周数确实不够」。 */
const trendNote = computed(() => {
  if (!Array.isArray(data.value?.trend?.periods)) {
    return missingNote('get_training_trend', '暂无趋势数据')
  }
  return '至少需要两周记录才能呈现趋势'
})

function percentOf(current: number | null | undefined, base: number | null | undefined): number | null {
  if (!base || current === null || current === undefined) return null
  return ((current - base) / base) * 100
}

/**
 * 周跑量增幅的配色：只对「加量」着色，因为这是伤病风险的方向。
 *
 * 加量 >30% 是常用的红线（红），小幅加量是琥珀提醒；减量不着色——基数很小时
 * 减量的百分比会失真到 ±200%，染成绿色反而像是鼓励，容易被误读。
 */
function toneForRamp(ramp: number): string | undefined {
  if (ramp > 30) return C.red
  if (ramp > 0) return C.amber
  return undefined
}

/* ── 比赛成绩预测（predict_race_time） ─────────────────────────────────── */

const CONFIDENCE_TEXT: Record<string, string> = { HIGH: '高', MEDIUM: '中', LOW: '低' }

interface RaceCard { label: string; value: string; hint: string; tone?: string; confidence: string; actual: boolean }

const raceCards = computed<RaceCard[]>(() => {
  const list = Array.isArray(data.value?.predictions?.predictions) ? data.value!.predictions.predictions : []
  return list.map((row: any): RaceCard => ({
    label: raceName(row.targetMeters),
    value: row.predictedText ?? fmtDuration((row.predictedSeconds ?? 0) / 60),
    hint: row.paceText ?? fmtPace(row.paceSecondsPerKm),
    // ACTUAL = 这个距离本来就有完整记录，RIEGEL = 由公式换算出来的。
    tone: row.source === 'ACTUAL' ? C.green : undefined,
    confidence: CONFIDENCE_TEXT[row.confidence] ?? row.confidence ?? '—',
    actual: row.source === 'ACTUAL',
  }))
})
const racesActualLabel = computed(() => raceCards.value.filter(card => card.actual).map(card => card.label).join('、'))
const raceReference = computed(() => {
  const range = data.value?.predictions?.range
  // 没有卡片时不给副标题，否则空面板顶上还挂着一句「全部为 Riegel 外推」，
  // 看起来像是渲染失败而不是没数据。
  if (!raceCards.value.length) return undefined
  return racesActualLabel.value && range
    ? `${range} 内 ${racesActualLabel.value} 为实测成绩，更远距离为 Riegel 外推`
    : '全部为 Riegel 外推，距离越远误差越大'
})

/** 预测面板空态：数据段没返回 / 区间内没有可用记录，是两件不同的事。 */
const raceNote = computed(() => {
  if (!Array.isArray(data.value?.predictions?.predictions)) {
    return missingNote('predict_race_time', '暂无预测数据')
  }
  return '区间内没有可用于预测的跑步记录'
})

/* ── 天气影响（get_weather_impact） ────────────────────────────────────── */

const weatherData = computed(() => data.value?.weather)
const weatherBaseline = computed<string>(() => weatherData.value?.baselinePaceText ?? '—')
const weatherSample = computed<number>(() => weatherData.value?.sampleSize ?? 0)
const weatherPoints = computed(() => {
  const buckets = Array.isArray(weatherData.value?.temperatureBuckets) ? weatherData.value.temperatureBuckets : []
  return buckets
    .filter((bucket: any) => typeof bucket.paceDeltaSecondsPerKm === 'number')
    .map((bucket: any) => ({
      label: bucket.label,
      value: bucket.paceDeltaSecondsPerKm,
      // 负数 = 比基线快。跑量图里绿=多，这里绿=快，一致地表达「有利」。
      color: bucket.paceDeltaSecondsPerKm < 0 ? C.green : C.amber,
      meta: `${bucket.runCount} 次 · ${bucket.avgPaceText}`,
    }))
})
const weatherAvailable = computed(() => weatherSample.value > 0 && weatherPoints.value.length > 0)
/** 相关系数 <0 说明气温越高配速数值越小（即越快），与直觉相反，所以要解释。 */
const weatherCorrelation = computed(() => {
  const value = weatherData.value?.temperaturePaceCorrelation
  if (typeof value !== 'number') return undefined
  const strength = Math.abs(value)
  const level = strength >= 0.6 ? '明显' : strength >= 0.3 ? '中等' : '很弱'
  return { value, text: `气温与配速相关 ${value.toFixed(2)}（${level}）` }
})

/** 天气面板空态：没返回数据段，和「返回了但天气未回填」，是两个不同的下一步。 */
const weatherNote = computed(() => {
  if (!weatherData.value) return missingNote('get_weather_impact', '暂无天气数据')
  return '暂无可用的天气分组。若刚同步过新记录，先回到对话里跑一次 reload_data 回填天气。'
})

/* ── 恢复状态（get_recovery_status） ────────────────────────────────────── */

const recovery = computed(() => data.value?.recovery)
const recoveryRisk = computed(() => {
  const level = recovery.value?.training?.riskLevel
  if (!level) return undefined
  if (level === 'OPTIMAL') return { text: '理想', tone: C.green }
  return { text: RISK_TEXT[level] ?? level, tone: RISK_TONE[level] ?? C.slate }
})
const recoveryCards = computed(() => {
  const r = recovery.value
  if (!r) return []
  return [
    { label: '睡眠评分', value: r.latestSleep?.score ?? '—', hint: r.latestSleep?.date },
    { label: '睡眠 HRV', value: r.latestSleep?.hrvMs ?? '—', unit: 'ms', hint: '最近一夜' },
    { label: '静息心率', value: r.vitals?.restingHeartRateAvg ?? '—', unit: 'bpm', hint: `${r.vitals?.daysWithRestingHeartRate ?? 0} 天` },
    { label: '负荷 ACWR', value: r.training?.acwr ?? '—', hint: recoveryRisk.value?.text },
    { label: '今日步数', value: r.stepsToday ?? '—', unit: '步' },
  ]
})

/* ── 睡眠（get_sleep_summary / get_sleep_trend） ────────────────────────── */

const sleepSummary = computed(() => data.value?.sleepSummary)
const sleepCards = computed(() => {
  const s = sleepSummary.value?.summary
  if (!s) return []
  return [
    { label: '平均睡眠', value: s.avgAsleepText ?? fmtDuration(s.avgAsleepMinutes), hint: `${s.nights} 夜` },
    { label: '平均效率', value: s.avgEfficiencyPercent ?? '—', unit: '%', hint: `${s.reportNights} 夜有评分` },
    { label: '平均评分', value: s.avgScore ?? '—', hint: `${s.reportNights} 夜` },
    { label: '深睡占比', value: s.avgDeepPercent ?? '—', unit: '%' },
    { label: 'REM 占比', value: s.avgRemPercent ?? '—', unit: '%' },
    { label: '平均醒来', value: s.avgWakeCount ?? '—', unit: '次' },
  ]
})
const sleepNightPoints = computed(() => {
  const nights = Array.isArray(sleepSummary.value?.nights) ? sleepSummary.value.nights.slice(-14) : []
  return nights
    .filter((night: any) => typeof night.asleepMinutes === 'number')
    .map((night: any) => ({ label: shortDate(night.date) ?? '', value: night.asleepMinutes, meta: night.asleepText }))
})
const sleepCoverageNote = computed(() => sleepSummary.value?.coverage?.note as string | undefined)

const sleepTrend = computed(() => data.value?.sleepTrend)
const sleepTrendPoints = computed(() => {
  const points = Array.isArray(sleepTrend.value?.points) ? sleepTrend.value.points : []
  return points
    .filter((point: any) => point.complete !== false && typeof point.values?.asleepMinutes === 'number')
    .slice(-12)
    .map((point: any) => ({ label: (point.period ?? '').replace(/^\d{4}-/, ''), value: point.values.asleepMinutes, meta: point.asleepText }))
})
const sleepTrendCards = computed(() => {
  const t = sleepTrend.value?.trend
  if (!t) return []
  return [
    { label: '最近周均', value: fmtDuration((t.last?.value ?? 0) / 60), hint: t.last?.period },
    { label: '较首期', value: `${signed(t.change ?? 0, 0)} 分`, tone: (t.change ?? 0) >= 0 ? C.green : C.amber },
    { label: '每周斜率', value: `${signed(t.slopePerPeriod ?? 0)} 分` },
    { label: '拟合度 r²', value: fmt(t.r2, 2) },
  ]
})

/* ── 体征（get_daily_vitals / get_hrv_trend） ───────────────────────────── */

const ASSESSMENT_TEXT: Record<string, string> = {
  flat: '平稳', improving: '改善', worsening: '下降', up: '上升', down: '下降', unknown: '看不出',
}
const vitals = computed(() => data.value?.vitals)
const vitalCards = computed(() => {
  const metrics = vitals.value?.metrics ?? {}
  const tile = (key: string, label: string, unit: string) => {
    const metric = metrics[key]
    if (!metric) return null
    return {
      label, value: metric.latest ?? metric.average ?? '—', unit,
      hint: `均值 ${metric.average ?? '—'} · ${ASSESSMENT_TEXT[metric.assessment] ?? metric.assessment ?? '—'}`,
    }
  }
  return [tile('restingHeartRate', '静息心率', 'bpm'), tile('hrv', 'HRV', 'ms'), tile('stress', '压力', '分'), tile('vo2max', 'VO2max', '')]
    .filter(Boolean) as Array<{ label: string; value: string | number; unit: string; hint?: string }>
})
const vitalPoints = computed(() => {
  const days = Array.isArray(vitals.value?.days) ? vitals.value.days.slice(-30) : []
  return days
    .filter((day: any) => typeof day.restingHeartRate === 'number')
    .map((day: any) => ({ label: shortDate(day.date) ?? '', value: day.restingHeartRate, meta: `HRV ${day.hrvRmssd ?? '—'}` }))
})
const vitalNote = computed(() => {
  const notes = Array.isArray(vitals.value?.notes) ? vitals.value.notes : []
  return notes.length ? notes[0] : undefined
})

const hrv = computed(() => data.value?.hrv)
const hrvCards = computed(() => {
  const h = hrv.value
  if (!h) return []
  return [
    { label: '平均 HRV', value: h.average ?? '—', unit: 'ms', hint: h.range },
    { label: '区间', value: `${h.min ?? '—'} ~ ${h.max ?? '—'}`, unit: 'ms' },
    {
      label: '首末变化', value: `${signed(h.change ?? 0)} ms`,
      tone: h.direction === 'up' ? C.green : h.direction === 'down' ? C.amber : undefined,
      hint: ASSESSMENT_TEXT[h.assessment] ?? h.assessment ?? undefined,
    },
    { label: '拟合度 r²', value: fmt(h.r2, 2) },
  ]
})
const hrvPoints = computed(() => {
  const periods = Array.isArray(hrv.value?.periods) ? hrv.value.periods : []
  return periods
    .filter((period: any) => typeof period.rmssd === 'number')
    .map((period: any) => ({ label: (period.period ?? '').replace(/^\d{4}-/, ''), value: period.rmssd, meta: `${period.nights} 夜` }))
})
const hrvBasis = computed(() => hrv.value?.basis === 'sleep' ? '睡眠 HRV（RMSSD）' : hrv.value?.basis)

/* ── 压力 / 血氧（get_stress_series / get_blood_oxygen） ─────────────────── */

const stress = computed(() => data.value?.stress)
const STRESS_LEVEL_TEXT: Record<string, string> = { relaxed: '放松', normal: '正常', moderate: '中等', high: '高' }
const stressCards = computed(() => {
  const s = stress.value
  if (!s) return []
  return [
    { label: '平均压力', value: s.average ?? '—', unit: '分', hint: STRESS_LEVEL_TEXT[s.level] ?? s.level },
    { label: '最高', value: s.max ?? '—', unit: '分', hint: s.peak?.time },
    { label: '最低', value: s.min ?? '—', unit: '分', hint: s.calmest?.time },
    { label: '样本', value: s.samples ?? '—', unit: '个', hint: `${s.firstSample ?? ''} ~ ${s.lastSample ?? ''}` },
  ]
})
const stressPoints = computed(() => {
  const buckets = Array.isArray(stress.value?.buckets) ? stress.value.buckets : []
  return buckets.map((bucket: any) => ({ label: bucket.bucket, value: bucket.average ?? 0, meta: `${bucket.samples} 点 · 峰 ${bucket.max}` }))
})

const bloodOxygen = computed(() => data.value?.bloodOxygen)
const spo2Daily = computed<any[]>(() => (Array.isArray(bloodOxygen.value?.daily) ? bloodOxygen.value.daily : []))
const spo2Cards = computed(() => {
  const b = bloodOxygen.value
  if (!b) return []
  const min = spo2Daily.value.length ? Math.min(...spo2Daily.value.map(day => day.min)) : '—'
  const avg = spo2Daily.value.length
    ? fmt(spo2Daily.value.reduce((sum, day) => sum + (day.average ?? 0), 0) / spo2Daily.value.length)
    : '—'
  return [
    { label: '记录天数', value: b.days ?? spo2Daily.value.length, unit: '天', hint: b.range },
    { label: '最低血氧', value: min, unit: '%', tone: typeof min === 'number' && min < 90 ? C.red : undefined },
    { label: '平均血氧', value: avg, unit: '%' },
    { label: '低氧事件', value: b.lowEventCount ?? 0, unit: '次', hint: '低于 90%' },
  ]
})
const spo2Points = computed(() => spo2Daily.value.map(day => ({
  label: shortDate(day.date) ?? '', value: day.average ?? 0, meta: `低氧 ${day.below95 ?? 0} 点`,
})))

/* ── 活动量（get_daily_activity / get_activity_minutes / get_heart_rate_series） */

const activity = computed(() => data.value?.activity)
const activityCards = computed(() => {
  const s = activity.value?.summary
  if (!s) return []
  const g = activity.value?.goals ?? {}
  return [
    { label: '日均步数', value: s.averageSteps?.toLocaleString('zh-CN') ?? '—', unit: '步', hint: `${s.days} 天` },
    { label: '日均距离', value: s.averageDistanceKm ?? '—', unit: 'km' },
    { label: '日均活跃', value: s.averageActiveMinutes ?? '—', unit: '分', hint: `目标 ${g.activeMinutesPerDay ?? '—'} 分` },
    { label: '日均站立', value: s.averageStandEvents ?? '—', unit: '次' },
    { label: '步数达标', value: g.daysMeetingSteps ?? '—', unit: '天', hint: `${s.days} 天中` },
  ]
})
const activityPoints = computed(() => {
  const days = Array.isArray(activity.value?.days) ? activity.value.days.slice(-30) : []
  return days
    .filter((day: any) => typeof day.steps === 'number')
    .map((day: any) => ({ label: shortDate(day.date) ?? '', value: day.steps, meta: `${fmt(day.distanceKm)} km` }))
})
const activityGoalNote = computed(() => {
  const g = activity.value?.goals
  if (!g) return undefined
  return `步数目标 ${g.stepsPerDay} · 活跃 ${g.activeMinutesPerWeek} 分/周（${g.weeklyActiveMinutesMet ? '已达成' : '未达成'}）`
})

const activityMinutes = computed(() => data.value?.activityMinutes)
const minuteCards = computed(() => {
  const s = activityMinutes.value?.summary
  if (!s) return []
  return [
    { label: '活动分钟', value: s.activityMinutes ?? '—', unit: '分', hint: s.date },
    { label: '步数', value: s.steps ?? '—', unit: '步' },
    { label: '距离', value: s.distanceKm ?? '—', unit: 'km' },
    { label: '站立事件', value: s.standEvents ?? '—', unit: '次' },
  ]
})
const minuteNote = computed(() => (Array.isArray(activityMinutes.value?.notes) ? activityMinutes.value.notes[0] : undefined) as string | undefined)

const heartRate = computed(() => data.value?.heartRate)
const hrCards = computed(() => {
  const s = heartRate.value?.stats
  if (!s) return []
  return [
    { label: '平均心率', value: s.average ?? '—', unit: 'bpm', hint: `${s.samples} 点` },
    { label: '最低', value: s.min ?? '—', unit: 'bpm', hint: heartRate.value?.lowest?.time },
    { label: '最高', value: s.max ?? '—', unit: 'bpm', hint: heartRate.value?.peak?.time },
    { label: '采样跨度', value: s.spanMinutes ?? '—', unit: '分', hint: `${s.firstSample ?? ''} ~ ${s.lastSample ?? ''}` },
  ]
})
const hrPoints = computed(() => {
  const buckets = Array.isArray(heartRate.value?.buckets) ? heartRate.value.buckets : []
  return buckets
    .filter((bucket: any) => typeof bucket.average === 'number')
    .map((bucket: any) => ({ label: bucket.time, value: bucket.average, meta: `${bucket.samples} 点 · 峰 ${bucket.max}` }))
})

/* ── 体成分 / 周报（get_body_composition / get_weekly_health_report） ────── */

const bodyComp = computed(() => data.value?.bodyComposition)
const bodyConfigs = computed<any[]>(() => (Array.isArray(bodyComp.value?.configs) ? bodyComp.value.configs : []))
const bodyNote = computed(() => (Array.isArray(bodyComp.value?.notes) ? bodyComp.value.notes[0] : undefined) as string | undefined)

const weeklyReport = computed(() => data.value?.weeklyReport)
const weeklyCards = computed(() => {
  const w = weeklyReport.value
  if (!w) return []
  return [
    { label: '周步数', value: w.steps?.totalSteps?.toLocaleString('zh-CN') ?? 0, hint: `${w.steps?.daysWithData ?? 0} 天有数据` },
    { label: '周跑量', value: w.runs?.totalDistanceKm ?? 0, unit: 'km', hint: `${w.runs?.runCount ?? 0} 次` },
    { label: '平均睡眠', value: w.sleep?.avgAsleepText ?? '—', hint: `${w.sleep?.nights ?? 0} 夜` },
    { label: '睡眠评分', value: w.sleep?.avgScore ?? '—' },
  ]
})

/* ── 华为跑力 / 跑姿 / 官方分段 / 勋章 / ECG ─────────────────────────────── */

const runLevel = computed(() => data.value?.runLevel)
const runLevelZones = computed<any[]>(() => (Array.isArray(runLevel.value?.zones) ? runLevel.value.zones : []))
const runLevelTimes = computed<any[]>(() => (Array.isArray(runLevel.value?.officialTimes) ? runLevel.value.officialTimes : []))
const runLevelCards = computed(() => {
  const r = runLevel.value
  if (!r) return []
  return [
    { label: '华为跑力', value: fmt(r.runLevel), hint: r.date },
    { label: '来源', value: r.source === 'HUAWEI_OFFICIAL' ? '官方' : r.source ?? '—' },
  ]
})

const dynamics = computed(() => data.value?.dynamics)
const dynamicsCards = computed(() => {
  const s = dynamics.value?.summary
  if (!s) return []
  return [
    { label: '距离', value: s.distanceKm ?? '—', unit: 'km', hint: s.date },
    { label: '步频', value: s.cadenceSpm ?? '—', unit: '步/分' },
    { label: '步幅', value: s.strideLengthMeters ?? '—', unit: 'm' },
    { label: '触地时间', value: s.groundContactTimeMs ?? '—', unit: 'ms' },
    { label: '垂直振幅', value: s.verticalOscillationCm ?? '—', unit: 'cm' },
    { label: '左右平衡', value: s.groundBalancePercent ?? '—', unit: '%' },
  ]
})
const dynamicsPoints = computed(() => {
  const segments = Array.isArray(dynamics.value?.segments) ? dynamics.value.segments : []
  return segments
    .filter((segment: any) => typeof segment.paceSecondsPerKm === 'number')
    .map((segment: any) => ({ label: `${segment.fromKm}-${segment.toKm}K`, value: segment.paceSecondsPerKm, meta: segment.paceText }))
})

const officialSplits = computed(() => data.value?.officialSplits)
const splitRows = computed<any[]>(() => {
  const km = officialSplits.value?.units?.km
  return km && Array.isArray(km.splits) ? km.splits : []
})

const medals = computed(() => data.value?.medals)
const medalRows = computed<any[]>(() => (Array.isArray(medals.value?.rows) ? medals.value.rows.slice(0, 8) : []))
const ecg = computed(() => data.value?.ecg)
const ecgRows = computed<any[]>(() => (Array.isArray(ecg.value?.rows) ? ecg.value.rows.slice(0, 8) : []))
</script>

<template>
  <ThemeProvider>
    <div class="sh-dashboard sh-grid">
      <header class="sh-space">
        <div style="font-size: 15px; font-weight: 700">运动健康</div>
        <ElTag v-if="range" type="info" size="small" round>{{ range }}</ElTag>
        <ElTag v-if="data && data.ok === false" type="danger" size="small" round>离线</ElTag>
        <ElTag v-else-if="data && data.ok" type="success" size="small" round>已连接</ElTag>
        <div style="margin-left: auto" class="sh-space">
          <span v-if="data?.generatedAt" style="font-size: 11px; color: var(--sh-faint)">更新于 {{ data.generatedAt }}</span>
          <ElButton size="small" :loading="loading" @click="load">刷新</ElButton>
        </div>
      </header>

      <template v-if="loading && data === null">
        <ShPanel title="正在连接 sport-health MCP 服务">
          <ElSkeleton :rows="5" animated />
        </ShPanel>
      </template>

      <template v-else-if="offline">
        <ElAlert
          type="error"
          :closable="false"
          show-icon
          title="无法读取看板数据"
          :description="fatal ?? data?.error ?? '无法读取 /sport-health/api/overview。请确认插件 host half 已加载。'"
        />
        <ShPanel title="启动 sport-health MCP 服务">
          <ol style="margin: 0; padding-left: 20px; font-size: 12.5px; line-height: 1.8">
            <li>进入 <code>../sport-health-mcp-server</code> 目录。</li>
            <li>确认已构建：<code>mvn -DskipTests package</code>（产物在 <code>target/</code>）。</li>
            <li>使用 JDK 21 启动：<code>java -jar target/sport-health-mcp-server-1.0.0.jar</code>。</li>
            <li>检查健康状态：<code>curl http://127.0.0.1:8080/actuator/health</code>。</li>
            <li>确认本插件的 <code>cordis.patch.yml</code> 中 MCP URL 与服务端口一致。</li>
          </ol>
          <ElButton type="primary" size="small" style="margin-top: 10px" @click="load">重试连接</ElButton>
        </ShPanel>
      </template>

      <template v-else>
        <ElAlert v-if="fatal" type="warning" :closable="false" show-icon :title="fatal" />

        <ShKpi
          v-if="summary"
          :items="[
            { label: '总距离', value: fmt(summary.totalDistanceKm), unit: 'km' },
            { label: '总时长', value: fmtDuration(summary.totalDurationMinutes) },
            { label: '跑步次数', value: summary.runCount ?? '—', unit: '次' },
            { label: '平均配速', value: summary.avgPaceText ?? fmtPace(summary.avgPaceSecondsPerKm) },
            { label: '总爬升', value: fmt(summary.totalClimbMeters), unit: 'm' },
            { label: '记录天数', value: `${summary.recordedDays ?? 0}/${summary.dayCount ?? 0}`, unit: '天' },
          ]"
        />

        <ShPanel
          title="周跑量趋势"
          :subtitle="trendLatest ? `完整周对比 · 近 ${trendComplete.length} 周` : undefined"
        >
          <ShKpi v-if="trendDeltas.length" :items="trendDeltas" />
          <Chart
            v-if="trendAvailable"
            kind="bar"
            :data="trendPoints"
            unit=" km"
            :show-values="true"
            :height="150"
          />
          <p v-else class="sh-note">{{ trendNote }}</p>
          <p v-if="trendOngoingNote" class="sh-note">{{ trendOngoingNote }}</p>
        </ShPanel>

        <div class="sh-split">
          <ShPanel title="每日跑量" :subtitle="dailyGroups.length ? '按天聚合' : undefined">
            <Chart v-if="dailyGroups.length" kind="bar" :data="dailyPoints" unit=" km" :height="180" />
            <p v-else class="sh-note">暂无每日数据</p>
          </ShPanel>
          <ShPanel title="训练类型构成" :subtitle="data?.mix?.range">
            <Chart
              v-if="mixTypes.length"
              kind="donut"
              :slices="mixSlices"
              center-label="总距离"
              :center-value="fmt(mixTotal)"
              :height="180"
            />
            <p v-else class="sh-note">暂无类型数据</p>
          </ShPanel>
        </div>

        <div class="sh-split">
          <ShPanel title="训练连续性" :subtitle="range">
            <Heatmap v-if="consistency" :days="consistency.days ?? []" :from="from" :to="to" />
            <p v-else class="sh-note">暂无连续性数据</p>
            <div v-if="consistency" class="sh-space" style="margin-top: 10px">
              <ElTag type="success" size="small" round>活跃 {{ consistency.activeDays }}/{{ consistency.totalDays }} 天</ElTag>
              <ElTag type="warning" size="small" round>当前连续 {{ consistency.currentStreak?.days ?? 0 }} 天</ElTag>
              <ElTag type="info" size="small" round>平均间隔 {{ fmt(consistency.avgGapDays) }} 天</ElTag>
            </div>
          </ShPanel>
          <ShPanel title="训练负荷" :subtitle="loadStats?.anchorDate ? `截至 ${loadStats.anchorDate}` : undefined">
            <template #right>
              <ElTag v-if="loadStats" :type="tagType(riskTone)" size="small" round>{{ riskLabel }}</ElTag>
            </template>
            <Chart v-if="loadStats" kind="gauge" :value="loadStats.acwr ?? 0" :label="`置信度 ${loadStats.confidence ?? '—'}`" :height="150" />
            <p v-else class="sh-note">暂无负荷数据</p>
            <p v-if="loadStats?.recommendation" class="sh-note">{{ loadStats.recommendation }}</p>
          </ShPanel>
        </div>

        <ShPanel v-if="bestCards.length" title="个人最佳">
          <ShKpi :items="bestCards" />
        </ShPanel>

        <div class="sh-split">
          <ShPanel title="比赛成绩预测" :subtitle="raceReference">
            <template v-if="data?.predictions?.exponent" #right>
              <ElTag type="info" size="small" round>Riegel 指数 {{ data.predictions.exponent }}</ElTag>
            </template>
            <ShKpi
              v-if="raceCards.length"
              :items="raceCards.map(card => ({ label: card.label, value: card.value, hint: `${card.hint} · 置信度 ${card.confidence}`, tone: card.tone }))"
            />
            <p v-else class="sh-note">{{ raceNote }}</p>
          </ShPanel>

          <ShPanel title="天气对配速的影响" :subtitle="weatherAvailable ? `基线 ${weatherBaseline} · ${weatherSample} 次` : undefined">
            <template v-if="weatherCorrelation" #right>
              <ElTag type="info" size="small" round>{{ weatherCorrelation.text }}</ElTag>
            </template>
            <Chart
              v-if="weatherAvailable"
              kind="bar"
              :horizontal="true"
              :data="weatherPoints"
              :format="(value: number) => fmtPaceDelta(value)"
              :height="150"
            />
            <p v-else class="sh-note">{{ weatherNote }}</p>
            <p v-if="weatherAvailable" class="sh-note">
              正值表示比整体平均更慢，负值更快。样本少时差异多来自当次强度，而不是天气。
            </p>
          </ShPanel>
        </div>

        <ShPanel title="近期跑步" :subtitle="runs.length ? `${runs.length} 条` : undefined">
          <ElTable v-if="runs.length" :data="runs" size="small" max-height="300" stripe>
            <ElTableColumn prop="date" label="日期" min-width="92" />
            <ElTableColumn label="距离" align="right" min-width="88">
              <template #default="{ row }">{{ fmt(row.distanceKm) }} km</template>
            </ElTableColumn>
            <ElTableColumn label="时长" align="right" min-width="120">
              <template #default="{ row }">{{ fmtDuration(row.durationMinutes) }}</template>
            </ElTableColumn>
            <ElTableColumn label="配速" align="right" min-width="92">
              <template #default="{ row }">{{ row.paceText ?? fmtPace(row.paceSecondsPerKm) }}</template>
            </ElTableColumn>
            <ElTableColumn label="爬升" align="right" min-width="84">
              <template #default="{ row }">{{ fmt(row.climbMeters) }} m</template>
            </ElTableColumn>
          </ElTable>
          <p v-else class="sh-note">暂无跑步记录</p>
        </ShPanel>

        <div class="sh-section">恢复与睡眠</div>

        <ShPanel title="恢复状态" :subtitle="recovery?.range">
          <template v-if="recoveryRisk" #right>
            <ElTag :type="tagType(recoveryRisk.tone)" size="small" round>{{ recoveryRisk.text }}</ElTag>
          </template>
          <ShKpi v-if="recoveryCards.length" :items="recoveryCards" />
          <p v-else class="sh-note">{{ missingNote('get_recovery_status', '暂无恢复状态数据') }}</p>
          <p v-if="recovery?.training?.recommendation" class="sh-note">{{ recovery.training.recommendation }}</p>
        </ShPanel>

        <div class="sh-split">
          <ShPanel title="睡眠概览" :subtitle="sleepSummary?.range">
            <ShKpi v-if="sleepCards.length" :items="sleepCards" />
            <p v-else class="sh-note">{{ missingNote('get_sleep_summary', '暂无睡眠概览数据') }}</p>
            <Chart
              v-if="sleepNightPoints.length"
              kind="bar"
              :data="sleepNightPoints"
              :format="(value: number) => fmtDuration(value / 60)"
              :height="150"
            />
            <p v-if="sleepCoverageNote" class="sh-note">{{ sleepCoverageNote }}</p>
          </ShPanel>
          <ShPanel title="睡眠趋势" :subtitle="sleepTrend?.range">
            <ShKpi v-if="sleepTrendCards.length" :items="sleepTrendCards" />
            <p v-else class="sh-note">{{ missingNote('get_sleep_trend', '暂无睡眠趋势数据') }}</p>
            <Chart
              v-if="sleepTrendPoints.length"
              kind="line"
              :data="sleepTrendPoints"
              :format="(value: number) => fmtDuration(value / 60)"
              :height="150"
            />
            <p v-if="sleepTrend?.trend?.direction && sleepTrend.trend.r2 < 0.4" class="sh-note">
              波动大于线性变化，这条拟合线只作参考。
            </p>
          </ShPanel>
        </div>

        <div class="sh-section">体征与活动</div>

        <div class="sh-split">
          <ShPanel title="每日体征" :subtitle="vitals?.range">
            <ShKpi v-if="vitalCards.length" :items="vitalCards" />
            <p v-else class="sh-note">{{ missingNote('get_daily_vitals', '暂无体征数据') }}</p>
            <Chart
              v-if="vitalPoints.length"
              kind="line"
              :data="vitalPoints"
              :format="(value: number) => `${fmt(value, 0)} bpm`"
              :height="150"
            />
            <p v-if="vitalNote" class="sh-note">{{ vitalNote }}</p>
          </ShPanel>
          <ShPanel title="HRV 趋势" :subtitle="hrvBasis">
            <ShKpi v-if="hrvCards.length" :items="hrvCards" />
            <p v-else class="sh-note">{{ missingNote('get_hrv_trend', '暂无 HRV 趋势数据') }}</p>
            <Chart
              v-if="hrvPoints.length"
              kind="line"
              :data="hrvPoints"
              :format="(value: number) => `${fmt(value)} ms`"
              :height="150"
              :color="C.purple"
            />
          </ShPanel>
        </div>

        <div class="sh-split">
          <ShPanel title="压力曲线" :subtitle="stress ? `${stress.date} · ${stress.bucketMinutes} 分钟分桶` : undefined">
            <ShKpi v-if="stressCards.length" :items="stressCards" />
            <p v-else class="sh-note">{{ missingNote('get_stress_series', '暂无压力数据') }}</p>
            <Chart
              v-if="stressPoints.length"
              kind="bar"
              :data="stressPoints"
              :format="(value: number) => `${fmt(value)} 分`"
              :height="140"
              :color="C.amber"
            />
            <p v-if="stress?.notes?.[3]" class="sh-note">{{ stress.notes[3] }}</p>
          </ShPanel>
          <ShPanel title="血氧" :subtitle="bloodOxygen?.range">
            <ShKpi v-if="spo2Cards.length" :items="spo2Cards" />
            <p v-else class="sh-note">{{ missingNote('get_blood_oxygen', '暂无血氧数据') }}</p>
            <Chart
              v-if="spo2Points.length"
              kind="line"
              :data="spo2Points"
              :format="(value: number) => `${fmt(value)}%`"
              :height="140"
              :color="C.cyan"
            />
          </ShPanel>
        </div>

        <ShPanel title="日常活动" :subtitle="activity?.range ?? activityGoalNote">
          <ShKpi v-if="activityCards.length" :items="activityCards" />
          <p v-else class="sh-note">{{ missingNote('get_daily_activity', '暂无活动数据') }}</p>
          <Chart
            v-if="activityPoints.length"
            kind="bar"
            :data="activityPoints"
            :format="(value: number) => value.toLocaleString('zh-CN')"
            :height="160"
            :color="C.green"
          />
          <p v-if="activityGoalNote" class="sh-note">{{ activityGoalNote }}</p>
        </ShPanel>

        <div class="sh-split">
          <ShPanel title="当天活动" :subtitle="activityMinutes ? `${activityMinutes.date} ${activityMinutes.weekday ?? ''}` : undefined">
            <ShKpi v-if="minuteCards.length" :items="minuteCards" />
            <p v-else class="sh-note">{{ missingNote('get_activity_minutes', '暂无当天活动数据') }}</p>
            <p v-if="minuteNote" class="sh-note">{{ minuteNote }}</p>
          </ShPanel>
          <ShPanel title="心率曲线" :subtitle="heartRate ? `${heartRate.date} · ${heartRate.resolution}` : undefined">
            <ShKpi v-if="hrCards.length" :items="hrCards" />
            <p v-else class="sh-note">{{ missingNote('get_heart_rate_series', '暂无心率曲线数据') }}</p>
            <Chart
              v-if="hrPoints.length"
              kind="line"
              :data="hrPoints"
              :format="(value: number) => `${fmt(value, 0)} bpm`"
              :height="140"
              :color="C.red"
            />
          </ShPanel>
        </div>

        <div class="sh-section">身体与华为数据</div>

        <div class="sh-split">
          <ShPanel title="体成分" :subtitle="bodyComp?.range">
            <ElTable v-if="bodyConfigs.length" :data="bodyConfigs" size="small" max-height="240" stripe>
              <ElTableColumn prop="label" label="配置" min-width="110" />
              <ElTableColumn label="记录" align="right" min-width="70">
                <template #default="{ row }">{{ row.measurements }}</template>
              </ElTableColumn>
              <ElTableColumn label="体成分" align="right" min-width="70">
                <template #default="{ row }">{{ row.bodyComposition }}</template>
              </ElTableColumn>
              <ElTableColumn label="体重" align="right" min-width="110">
                <template #default="{ row }">{{ fmt(row.weightMin) }}~{{ fmt(row.weightMax) }} kg</template>
              </ElTableColumn>
            </ElTable>
            <p v-else class="sh-note">{{ missingNote('get_body_composition', '暂无体成分数据') }}</p>
            <p v-if="bodyNote" class="sh-note">{{ bodyNote }}</p>
          </ShPanel>
          <ShPanel title="周健康报告" :subtitle="weeklyReport?.range">
            <ShKpi v-if="weeklyCards.length" :items="weeklyCards" />
            <p v-else class="sh-note">{{ missingNote('get_weekly_health_report', '暂无周报数据') }}</p>
            <p v-if="weeklyReport?.text" class="sh-note">{{ weeklyReport.text }}</p>
          </ShPanel>
        </div>

        <div class="sh-split">
          <ShPanel title="华为跑力" :subtitle="runLevel?.date">
            <ShKpi v-if="runLevelCards.length" :items="runLevelCards" />
            <p v-else class="sh-note">{{ missingNote('get_run_level', '暂无跑力数据') }}</p>
            <ElTable v-if="runLevelZones.length" :data="runLevelZones" size="small" max-height="180" stripe>
              <ElTableColumn prop="code" label="档位" width="58" />
              <ElTableColumn prop="name" label="名称" min-width="96" />
              <ElTableColumn prop="paceText" label="配速" min-width="100" />
            </ElTable>
            <ElTable v-if="runLevelTimes.length" :data="runLevelTimes" size="small" max-height="180" stripe style="margin-top: 8px">
              <ElTableColumn label="距离" min-width="80">
                <template #default="{ row }">{{ raceName(row.distanceMeters) }}</template>
              </ElTableColumn>
              <ElTableColumn prop="timeText" label="官方成绩" min-width="96" />
            </ElTable>
          </ShPanel>
          <ShPanel title="跑姿" :subtitle="dynamics?.date">
            <ShKpi v-if="dynamicsCards.length" :items="dynamicsCards" />
            <p v-else class="sh-note">{{ missingNote('get_running_dynamics', '暂无跑姿数据') }}</p>
            <Chart
              v-if="dynamicsPoints.length"
              kind="bar"
              :data="dynamicsPoints"
              :format="(value: number) => fmtPace(value)"
              :height="150"
              :color="C.purple"
            />
          </ShPanel>
        </div>

        <ShPanel title="官方分段" :subtitle="officialSplits ? `${officialSplits.date} · ${officialSplits.sport ?? ''}` : undefined">
          <ElTable v-if="splitRows.length" :data="splitRows" size="small" max-height="260" stripe>
            <ElTableColumn label="段" width="64">
              <template #default="{ row }">{{ row.index }}</template>
            </ElTableColumn>
            <ElTableColumn label="区间" min-width="86">
              <template #default="{ row }">{{ row.fromKm }}~{{ row.toKm }} km</template>
            </ElTableColumn>
            <ElTableColumn prop="paceTextPerKm" label="官方配速" min-width="100" />
            <ElTableColumn prop="gpsPaceText" label="GPS 配速" min-width="100" />
            <ElTableColumn prop="deltaText" label="差值" min-width="130" />
          </ElTable>
          <p v-else class="sh-note">{{ missingNote('get_official_splits', '暂无官方分段数据') }}</p>
        </ShPanel>

        <div class="sh-split">
          <ShPanel title="体育勋章" :subtitle="medals ? `共 ${medals.total} 枚` : undefined">
            <ElTable v-if="medalRows.length" :data="medalRows" size="small" max-height="220" stripe>
              <ElTableColumn prop="medalType" label="类型" min-width="80" />
              <ElTableColumn prop="medalLevel" label="等级" min-width="80" />
              <ElTableColumn prop="gainCount" label="次数" align="right" min-width="64" />
              <ElTableColumn label="最近获得" min-width="110">
                <template #default="{ row }">{{ row.takeDate?.slice(0, 10) }}</template>
              </ElTableColumn>
            </ElTable>
            <p v-else class="sh-note">{{ missingNote('get_medals', '暂无勋章数据') }}</p>
          </ShPanel>
          <ShPanel title="ECG 记录" :subtitle="ecg ? `共 ${ecg.total} 条` : undefined">
            <ElTable v-if="ecgRows.length" :data="ecgRows" size="small" max-height="220" stripe>
              <ElTableColumn label="时间" min-width="130">
                <template #default="{ row }">{{ row.startTime?.slice(0, 16) }}</template>
              </ElTableColumn>
              <ElTableColumn label="平均心率" align="right" min-width="90">
                <template #default="{ row }">{{ row.averageHeartRate }} bpm</template>
              </ElTableColumn>
              <ElTableColumn prop="ecgArrhyType" label="心律类型" min-width="90" />
            </ElTable>
            <p v-else class="sh-note">{{ missingNote('get_ecg_records', '暂无 ECG 数据') }}</p>
          </ShPanel>
        </div>

        <ShPanel v-if="Array.isArray(data?.errors) && data.errors.length" title="部分数据不可用">
          <ul style="margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.7; color: var(--sh-muted)">
            <li v-for="error in data.errors" :key="error.tool">{{ error.tool }}: {{ error.message }}</li>
          </ul>
        </ShPanel>
      </template>
    </div>
  </ThemeProvider>
</template>

<style>
.sh-dashboard { padding: 4px 2px; }
.sh-section {
  margin-top: 6px;
  padding-bottom: 5px;
  border-bottom: 1px solid var(--sh-line);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.4px;
  color: var(--sh-faint);
}
</style>
