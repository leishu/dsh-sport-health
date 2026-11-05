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
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, GaugeChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ECharts, EChartsOption } from 'echarts'

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

/** Options are built by callers with a colour object; re-read it on theme change. */
function render(): void {
  if (!chart.value) return
  chart.value.setOption(props.option, { notMerge: true, lazyUpdate: true })
  chart.value.resize()
}

/**
 * Idempotent: safe to call again after the chart went from empty to non-empty.
 *
 * 旧实现在 `props.empty` 时直接 return，而 `render()` 又靠 `chart.value`
 * 守卫，于是「先空后有」的图表（数据晚一步到、结果被替换）会彻底空白 ——
 * `showEmpty` 变 false 后容器是可见的，但里面从来没有实例。
 */
function mount(): void {
  if (!host.value || props.empty || chart.value || failed.value) return
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
/** 空 → 有数据：容器此前是 `v-show` 隐藏的，实例必须在变得可见之后补建。 */
watch(() => props.empty, empty => { if (!empty) nextTick(mount) })

const showEmpty = computed(() => props.empty || failed.value)
const style = computed(() => ({ height: `${props.height}px` }))
</script>

<template>
  <div class="sh-chart" :style="style" role="img" :aria-label="ariaLabel">
    <div v-show="!showEmpty" ref="host" style="width: 100%; height: 100%" />
    <div v-if="showEmpty" class="sh-chart__empty">{{ failed ? '图表渲染失败' : emptyText }}</div>
  </div>
</template>
