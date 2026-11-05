/**
 * Calendar heatmap (GitHub-style) for training consistency.
 *
 * Weeks are columns, ISO weekdays are rows. A missing day is not "no data" but
 * "no run", which is exactly what the consistency view wants to show, so every
 * day in the window gets a cell.
 */
<script setup lang="ts">
import { computed } from 'vue'
import * as echarts from 'echarts/core'
import { HeatmapChart } from 'echarts/charts'
import { CalendarComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import EChart from './EChart.vue'
import { useEChartColors } from '../lib/useEChartColors.ts'
import { C } from '../lib/theme.ts'
import { fmt } from '../lib/format.ts'

echarts.use([HeatmapChart, CalendarComponent, TooltipComponent, VisualMapComponent, CanvasRenderer])

interface Day {
  date: string
  runCount: number
  distanceKm: number
}

const props = withDefaults(defineProps<{ days: Day[]; from?: string; to?: string; height?: number }>(), {
  from: undefined,
  to: undefined,
  height: 150,
})

const colors = useEChartColors()

const sorted = computed(() => props.days.map(day => day.date).filter(Boolean).sort())
const start = computed(() => props.from ?? sorted.value[0] ?? '')
const end = computed(() => props.to ?? sorted.value[sorted.value.length - 1] ?? '')

const option = computed<EChartsOption>(() => {
  const theme = colors.value
  const max = Math.max(1, ...props.days.map(day => day.distanceKm))
  return {
    animationDuration: 320,
    tooltip: {
      backgroundColor: theme.tooltipBg,
      borderColor: theme.tooltipBorder,
      textStyle: { color: theme.text, fontSize: 12, fontFamily: 'inherit' },
      formatter: (params: any) => {
        const [date, value] = params.value as [string, number]
        const day = props.days.find(item => item.date === date)
        return day ? `${date}<br/>${day.runCount} 次 · ${fmt(day.distanceKm)} km` : `${date}<br/>无记录`
      },
    },
    visualMap: {
      show: false,
      min: 0,
      max,
      inRange: { color: ['rgba(127,127,127,0.12)', C.green] },
    },
    calendar: {
      top: 22,
      left: 26,
      right: 10,
      bottom: 6,
      cellSize: ['auto', 15],
      orient: 'horizontal',
      range: [start.value, end.value].filter(Boolean),
      itemStyle: { color: 'transparent', borderWidth: 2, borderColor: 'transparent' },
      splitLine: { show: false },
      yearLabel: { show: false },
      monthLabel: { color: theme.faint, fontSize: 10 },
      dayLabel: { firstDay: 1, color: theme.faint, fontSize: 10, nameMap: ['日','一','二','三','四','五','六'] },
    },
    series: [{
      type: 'heatmap',
      coordinateSystem: 'calendar',
      data: props.days.map(day => [day.date, day.distanceKm]),
      itemStyle: { borderRadius: 3, borderColor: 'transparent', borderWidth: 1 },
      emphasis: { itemStyle: { borderColor: C.green, borderWidth: 1.5 } },
    }],
  }
})
</script>

<template>
  <EChart
    v-if="start && end"
    :option="option"
    :height="height"
    empty-text="暂无训练日历"
  />
  <div v-else class="sh-chart__empty" style="position: static; height: 80px">暂无训练日历</div>
</template>
