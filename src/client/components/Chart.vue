/** Chart wrappers that bind the theme palette to the option builders. */
<script setup lang="ts">
import { computed } from 'vue'
import EChart from './EChart.vue'
import { barOption, donutOption, gaugeOption, lineOption, type DonutSlice, type Point } from '../lib/charts.ts'
import { useEChartColors } from '../lib/useEChartColors.ts'
import { C } from '../lib/theme.ts'
import { fmt } from '../lib/format.ts'

const props = withDefaults(defineProps<{
  data?: Point[]
  height?: number
  color?: string
  unit?: string
  format?: (value: number) => string
  showValues?: boolean
  area?: boolean
  slices?: DonutSlice[]
  centerLabel?: string
  centerValue?: string
  value?: number
  max?: number
  label?: string
  kind?: 'line' | 'bar' | 'donut' | 'gauge'
  emptyText?: string
}>(), {
  data: () => [],
  height: 170,
  color: C.accent,
  unit: '',
  showValues: false,
  area: true,
  slices: () => [],
  centerLabel: '',
  centerValue: undefined,
  value: 0,
  max: 2.5,
  label: '',
  kind: 'bar',
  emptyText: '暂无数据',
  format: undefined,
})

const colors = useEChartColors()
const format = computed(() => props.format ?? ((value: number) => fmt(value)))
const isEmpty = computed(() => {
  if (props.kind === 'donut') return props.slices.length === 0
  if (props.kind === 'gauge') return false
  return props.data.length === 0
})

const option = computed(() => {
  switch (props.kind) {
    case 'line':
      return lineOption(props.data, colors.value, { color: props.color, unit: props.unit, format: format.value, area: props.area })
    case 'donut':
      return donutOption(props.slices, colors.value, { centerLabel: props.centerLabel, centerValue: props.centerValue, format: format.value })
    case 'gauge':
      return gaugeOption(props.value, colors.value, { max: props.max, label: props.label })
    default:
      return barOption(props.data, colors.value, { color: props.color, unit: props.unit, format: format.value, showValues: props.showValues })
  }
})
</script>

<template>
  <EChart :option="option" :height="height" :empty="isEmpty" :empty-text="emptyText" />
</template>
