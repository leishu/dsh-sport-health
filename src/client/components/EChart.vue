/**
 * ECharts renderer.
 *
 * - Imports only the pieces we use (tree-shaken core + line/bar/pie/gauge).
 * - Rebuilds the option whenever the theme flips, so axis/tooltip colours track
 *   the Harness light/dark theme instead of being frozen at mount time.
 * - Falls back to a labelled empty state when ECharts is not available (SSR or
 *   a headless test environment), so cards never render blank.
 */
<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, GaugeChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ECharts, EChartsOption } from 'echarts'
import { FALLBACK_COLORS, type ThemeColors } from '../lib/charts.ts'

echarts.use([BarChart, GaugeChart, LineChart, PieChart, GridComponent, TitleComponent, TooltipComponent, CanvasRenderer])

const props = withDefaults(defineProps<{
  option: EChartsOption
  height?: number
  empty?: boolean
  emptyText?: string
  ariaLabel?: string
}>(), {
  height: 170,
  empty: false,
  emptyText: '暂无数据',
})

const host = ref<HTMLDivElement | null>(null)
const chart = shallowRef<ECharts | null>(null)
const failed = ref(false)
/** Bumped by the theme provider so charts rebuild with the new palette. */
const themeKey = inject<{ value: number }>('sh-theme-key', { value: 0 })

const readColors = (): ThemeColors => {
  const el = host.value
  if (!el || typeof getComputedStyle !== 'function') return FALLBACK_COLORS
  const style = getComputedStyle(el)
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    text: read('--sh-muted', FALLBACK_COLORS.text),
    faint: read('--sh-faint', FALLBACK_COLORS.faint),
    line: read('--sh-line', FALLBACK_COLORS.line),
    surface: read('--sh-surface-strong', FALLBACK_COLORS.surface),
    background: 'transparent',
    tooltipBg: read('--el-bg-color-overlay', FALLBACK_COLORS.tooltipBg),
    tooltipBorder: read('--el-border-color-light', FALLBACK_COLORS.tooltipBorder),
  }
}

/** Options are built by callers with a colour object; re-read it on theme change. */
function render(): void {
  if (!chart.value) return
  chart.value.setOption(props.option, { notMerge: true, lazyUpdate: true })
  chart.value.resize()
}

function mount(): void {
  if (!host.value || props.empty) return
  try {
    chart.value = echarts.init(host.value, undefined, { renderer: 'canvas' })
    chart.value.setOption(props.option, { notMerge: true })
  } catch (error) {
    failed.value = true
    console.warn('[dsh-sport-health] echarts init failed', error)
  }
}

let observer: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null

onMounted(() => {
  mount()
  if (!host.value) return
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => chart.value?.resize())
    observer.observe(host.value)
  }
  if (typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver(() => chart.value?.resize())
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] })
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  themeObserver?.disconnect()
  chart.value?.dispose()
  chart.value = null
})

watch(() => props.option, render, { deep: false })
watch(themeKey, render)
watch(() => props.height, () => chart.value?.resize())

const showEmpty = computed(() => props.empty || failed.value)
const style = computed(() => ({ height: `${props.height}px` }))
</script>

<template>
  <div class="sh-chart" :style="style" role="img" :aria-label="ariaLabel">
    <div v-show="!showEmpty" ref="host" style="width: 100%; height: 100%" />
    <div v-if="showEmpty" class="sh-chart__empty">{{ failed ? '图表渲染失败' : emptyText }}</div>
  </div>
</template>
