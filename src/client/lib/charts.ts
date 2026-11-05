/**
 * ECharts option builders.
 *
 * Every builder returns a plain option object so the renderer (`EChart.vue`)
 * stays generic: theme colours are read from CSS variables at runtime and
 * pushed in through `createTheme()`.
 */
import type { EChartsOption } from 'echarts'
import { C, PALETTE } from './theme.ts'

export interface ThemeColors {
  text: string
  faint: string
  line: string
  surface: string
  background: string
  tooltipBg: string
  tooltipBorder: string
}

export const FALLBACK_COLORS: ThemeColors = {
  text: '#c9ccd4',
  faint: 'rgba(154,161,171,0.9)',
  line: 'rgba(255,255,255,0.10)',
  surface: 'rgba(255,255,255,0.035)',
  background: 'transparent',
  tooltipBg: '#22252b',
  tooltipBorder: 'rgba(255,255,255,0.14)',
}

export interface Point {
  label: string
  value: number | null
  color?: string
  meta?: string
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'

function tooltip(colors: ThemeColors): EChartsOption['tooltip'] {
  return {
    backgroundColor: colors.tooltipBg,
    borderColor: colors.tooltipBorder,
    borderWidth: 1,
    padding: [7, 10],
    textStyle: { color: colors.text, fontSize: 12, fontFamily: FONT },
    extraCssText: 'border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,0.18);',
  }
}

function axisLabel(colors: ThemeColors) {
  return { color: colors.faint, fontSize: 10, fontFamily: FONT }
}

function splitLine(colors: ThemeColors) {
  return { lineStyle: { color: colors.line, width: 1, type: 'solid' as const } }
}

function grid(tight = false) {
  return { left: 46, right: 14, top: tight ? 16 : 22, bottom: 6, containLabel: true }
}

/** Line / area chart. `null` values create gaps instead of dropping to zero. */
export function lineOption(
  data: Point[],
  colors: ThemeColors,
  options: { height?: number; color?: string; unit?: string; format?: (v: number) => string; area?: boolean; smooth?: boolean } = {},
): EChartsOption {
  const { color = C.accent, unit = '', format = (v: number) => String(v), area = true, smooth = true } = options
  return {
    animationDuration: 320,
    grid: grid(),
    tooltip: {
      ...tooltip(colors),
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: colors.line } },
      valueFormatter: (value: unknown) => (value === null || value === undefined || value === '' ? '—' : `${format(Number(value))}${unit}`),
    },
    xAxis: {
      type: 'category',
      data: data.map(point => point.label),
      boundaryGap: false,
      axisLine: { lineStyle: { color: colors.line } },
      axisTick: { show: false },
      axisLabel: { ...axisLabel(colors), hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      scale: true,
      splitNumber: 4,
      axisLabel: { ...axisLabel(colors), formatter: (value: number) => format(value) },
      splitLine: splitLine(colors),
    },
    series: [{
      type: 'line',
      data: data.map(point => (point.value === null || point.value === undefined || Number.isNaN(point.value) ? null : point.value)),
      connectNulls: false,
      smooth,
      showSymbol: data.length <= 24,
      symbol: 'circle',
      symbolSize: 5,
      lineStyle: { width: 2, color },
      itemStyle: { color },
      areaStyle: area
        ? {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [{ offset: 0, color: `${color}33` }, { offset: 1, color: `${color}00` }],
            },
          }
        : undefined,
    }],
  }
}

/** Vertical bars with per-point colours and a compact axis. */
export function barOption(
  data: Point[],
  colors: ThemeColors,
  options: { color?: string; unit?: string; format?: (v: number) => string; showValues?: boolean; horizontal?: boolean } = {},
): EChartsOption {
  const { color = C.accent, unit = '', format = (v: number) => String(v), showValues = false, horizontal = false } = options
  const category = {
    type: 'category' as const,
    data: data.map(point => point.label),
    axisLine: { lineStyle: { color: colors.line } },
    axisTick: { show: false },
    axisLabel: { ...axisLabel(colors), hideOverlap: true },
  }
  const valueAxis = {
    type: 'value' as const,
    splitNumber: 4,
    axisLabel: { ...axisLabel(colors), formatter: (value: number) => format(value) },
    splitLine: splitLine(colors),
  }
  return {
    animationDuration: 320,
    grid: { ...grid(), left: horizontal ? 10 : 46 },
    tooltip: {
      ...tooltip(colors),
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: colors.surface } },
      valueFormatter: (value: unknown) => `${format(Number(value ?? 0))}${unit}`,
    },
    xAxis: horizontal ? valueAxis : category,
    yAxis: horizontal ? { ...category, inverse: true } : valueAxis,
    series: [{
      type: 'bar',
      data: data.map(point => ({
        value: point.value ?? 0,
        itemStyle: { color: point.color ?? color, borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0] },
      })),
      barMaxWidth: 34,
      barCategoryGap: '38%',
      label: showValues
        ? { show: true, position: 'top', color: colors.faint, fontSize: 9.5, formatter: (params: any) => format(Number(params.value)), fontFamily: FONT }
        : { show: false },
      emphasis: { focus: 'series' },
    }],
  }
}

export interface DonutSlice { label: string; value: number; color?: string }

/** Ring chart with the total in the middle (used for the training mix). */
export function donutOption(
  slices: DonutSlice[],
  colors: ThemeColors,
  options: { centerLabel?: string; centerValue?: string; format?: (v: number) => string } = {},
): EChartsOption {
  const { centerLabel = '', centerValue, format = (v: number) => String(v) } = options
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  return {
    animationDuration: 360,
    color: PALETTE,
    tooltip: {
      ...tooltip(colors),
      trigger: 'item',
      formatter: (params: any) => `${params.marker}${params.name}<br/><b>${format(params.value)}</b> · ${params.percent}%`,
    },
    title: {
      text: centerValue ?? format(total),
      subtext: centerLabel,
      left: 'center',
      top: '38%',
      itemGap: 4,
      textStyle: { color: colors.text, fontSize: 20, fontWeight: 650, fontFamily: FONT },
      subtextStyle: { color: colors.faint, fontSize: 10.5, fontFamily: FONT },
    },
    legend: { show: false },
    series: [{
      type: 'pie',
      radius: ['56%', '80%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: true,
      padAngle: 1.5,
      itemStyle: { borderColor: 'transparent', borderWidth: 2, borderRadius: 4 },
      label: { show: false },
      labelLine: { show: false },
      emphasis: { scale: true, scaleSize: 4 },
      data: slices
        .filter(slice => slice.value > 0)
        .map((slice, index) => ({
          name: slice.label,
          value: slice.value,
          itemStyle: { color: slice.color ?? PALETTE[index % PALETTE.length] },
        })),
    }],
  }
}

/** Semi-circular gauge for ACWR-style ratios. */
export function gaugeOption(
  value: number,
  colors: ThemeColors,
  options: { max?: number; label?: string; thresholds?: [number, number, number] } = {},
): EChartsOption {
  const { max = 2.5, label = '', thresholds = [0.8, 1.3, 1.5] } = options
  const tone = value > thresholds[2] ? C.red : value > thresholds[1] ? C.amber : value < thresholds[0] ? C.cyan : C.green
  return {
    animationDuration: 480,
    series: [{
      type: 'gauge',
      startAngle: 180,
      endAngle: 0,
      min: 0,
      max,
      center: ['50%', '76%'],
      radius: '104%',
      progress: { show: true, width: 14, roundCap: true, itemStyle: { color: tone } },
      axisLine: { roundCap: true, lineStyle: { width: 14, color: [[1, colors.surface]] } },
      pointer: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      anchor: { show: false },
      title: {
        show: true,
        offsetCenter: [0, '-26%'],
        color: colors.faint,
        fontSize: 11,
        fontFamily: FONT,
      },
      detail: {
        offsetCenter: [0, '-4%'],
        formatter: () => value.toFixed(2),
        color: tone,
        fontSize: 26,
        fontWeight: 700,
        fontFamily: FONT,
      },
      data: [{ value: Math.max(0, Math.min(max, value)), name: label }],
    }],
  }
}

/** Heikin-style barrel for average pace per split: lower is faster. */
export function paceBarOption(splits: Array<{ label: string; value: number | null; color?: string }>, colors: ThemeColors): EChartsOption {
  return barOption(splits, colors, { format: v => `${Math.floor(v / 60)}'${String(Math.round(v % 60)).padStart(2, '0')}"` })
}
