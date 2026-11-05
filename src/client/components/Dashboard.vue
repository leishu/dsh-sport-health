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
  errors?: Array<{ tool: string; message: string }>
  error?: string
}

const data = ref<Overview | null>(null)
const loading = ref(true)
const fatal = ref<string | null>(null)
let controller: AbortController | null = null

async function load(): Promise<void> {
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  fatal.value = null
  try {
    const response = await fetch('/sport-health/api/overview', {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`看板接口返回 HTTP ${response.status}`)
    const next = await response.json() as Overview
    data.value = next
    if (next.ok === false && next.error) fatal.value = next.error
  } catch (error) {
    if ((error as any)?.name === 'AbortError') return
    fatal.value = error instanceof Error ? error.message : String(error)
    data.value = null
  } finally {
    if (!controller?.signal.aborted) loading.value = false
  }
}

onMounted(() => { void load() })
onBeforeUnmount(() => controller?.abort())

const summary = computed(() => data.value?.summary?.summary ?? data.value?.summary)
const range = computed<string | undefined>(() => data.value?.consistency?.range
  ?? (summary.value?.from && summary.value?.to ? `${summary.value.from} ~ ${summary.value.to}` : undefined))
const [from, to] = [computed(() => splitRange(range.value)[0]), computed(() => splitRange(range.value)[1])]
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
              horizontal
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
</style>
