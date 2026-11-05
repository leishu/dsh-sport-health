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
import { fmt, fmtDuration, fmtPace, shortDate } from '../lib/format.ts'
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
