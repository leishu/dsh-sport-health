/**
 * GPS route trace.
 *
 * No basemap is loaded (the card must work offline), so the track is drawn as
 * an equirectangular projection: longitude is scaled by cos(latitude) to keep
 * the shape and use one scale for both axes. Start/end are marked with pins.
 */
<script setup lang="ts">
import { computed } from 'vue'
import * as echarts from 'echarts/core'
import { LinesChart, ScatterChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import EChart from './EChart.vue'
import { useEChartColors } from '../lib/useEChartColors.ts'
import { C } from '../lib/theme.ts'

echarts.use([LinesChart, ScatterChart, GridComponent, TooltipComponent, CanvasRenderer])

interface RoutePoint {
  latitude: number
  longitude: number
  altitudeMeters?: number
}

const props = withDefaults(defineProps<{ points: RoutePoint[]; height?: number }>(), { height: 240 })

const colors = useEChartColors()

const valid = computed(() => props.points.filter(point => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)))

const option = computed<EChartsOption>(() => {
  const points = valid.value
  const latMid = points.reduce((sum, point) => sum + point.latitude, 0) / Math.max(points.length, 1)
  const cos = Math.cos((latMid * Math.PI) / 180)
  const coords = points.map(point => [point.longitude * cos, point.latitude])
  const theme = colors.value
  const start = coords[0]
  const end = coords[coords.length - 1]
  return {
    animationDuration: 320,
    grid: { left: 18, right: 18, top: 18, bottom: 18 },
    xAxis: { type: 'value', show: false, scale: true },
    yAxis: { type: 'value', show: false, scale: true },
    tooltip: {
      trigger: 'item',
      backgroundColor: theme.tooltipBg,
      borderColor: theme.tooltipBorder,
      textStyle: { color: theme.text, fontSize: 12 },
      formatter: (params: any) => {
        const [lon, lat] = params.value ?? []
        const point = params.data?.raw as RoutePoint | undefined
        const altitude = point?.altitudeMeters !== undefined ? `<br/>海拔 ${point.altitudeMeters.toFixed(1)} m` : ''
        return `${params.seriesName}<br/>${(lat / 1).toFixed(5)}, ${(lon / cos).toFixed(5)}${altitude}`
      },
    },
    series: [
      {
        type: 'lines',
        name: '轨迹',
        coordinateSystem: 'cartesian2d',
        polyline: true,
        data: [{ coords }],
        lineStyle: { color: C.accent, width: 2.6, opacity: 0.92, cap: 'round', join: 'round' },
        silent: true,
      },
      {
        type: 'scatter',
        name: '起点',
        symbolSize: 11,
        itemStyle: { color: C.green, borderColor: '#fff', borderWidth: 1.5 },
        label: { show: true, formatter: '起点', position: 'right', color: C.green, fontSize: 11 },
        data: [{ value: start, raw: points[0] }],
      },
      {
        type: 'scatter',
        name: '终点',
        symbolSize: 11,
        itemStyle: { color: C.red, borderColor: '#fff', borderWidth: 1.5 },
        label: { show: true, formatter: '终点', position: 'left', color: C.red, fontSize: 11 },
        data: [{ value: end, raw: points[points.length - 1] }],
      },
    ],
  }
})
</script>

<template>
  <div class="sh-route" :style="{ height: `${height}px` }">
    <EChart v-if="valid.length >= 2" :option="option" :height="height" aria-label="GPS 轨迹" />
    <div v-else class="sh-chart__empty" style="position: static; height: 100%">没有可绘制的 GPS 轨迹</div>
  </div>
</template>
