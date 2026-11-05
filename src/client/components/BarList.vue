/**
 * Bar list — an ECharts horizontal bar used as an inline "table with bars".
 * Long category labels sit on the y-axis, so no custom DOM is needed.
 */
<script setup lang="ts">
import { computed } from 'vue'
import EChart from './EChart.vue'
import { barOption, type Point } from '../lib/charts.ts'
import { useEChartColors } from '../lib/useEChartColors.ts'
import { fmt } from '../lib/format.ts'

const props = withDefaults(defineProps<{
  items: Point[]
  format?: (value: number) => string
  unit?: string
  rowHeight?: number
}>(), {
  format: (value: number) => fmt(value),
  unit: '',
  rowHeight: 26,
})

const colors = useEChartColors()

const data = computed<Point[]>(() => props.items.map(item => ({
  label: item.meta ? `${item.label}  (${item.meta})` : item.label,
  value: item.value ?? 0,
  color: item.color,
})))

const height = computed(() => Math.max(56, data.value.length * props.rowHeight + 24))
const option = computed(() => barOption(data.value, colors.value, {
  format: props.format,
  unit: props.unit,
  horizontal: true,
}))
</script>

<template>
  <EChart :option="option" :height="height" :empty="items.length === 0" />
</template>
