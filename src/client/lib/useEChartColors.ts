/**
 * Reactive access to the theme colours charts need.
 *
 * CSS variables are only resolvable in the browser, so the composable reads
 * them from `document` once mounted, and re-reads them whenever the theme
 * provider bumps the shared key or the root `data-theme` attribute changes.
 */
import { computed, inject, onMounted, ref, type ComputedRef } from 'vue'
import { FALLBACK_COLORS, type ThemeColors } from './charts.ts'

function sampler(): Element | null {
  if (typeof document === 'undefined') return null
  return document.body ?? document.documentElement ?? null
}

export function readColors(): ThemeColors {
  const el = sampler()
  if (!el || typeof getComputedStyle !== 'function' || typeof document === 'undefined') return FALLBACK_COLORS
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

export function useEChartColors(): ComputedRef<ThemeColors> {
  const themeKey = inject<{ value: number }>('sh-theme-key', { value: 0 })
  const colors = ref<ThemeColors>(FALLBACK_COLORS)
  const sample = () => { colors.value = readColors() }
  onMounted(sample)
  return computed(() => {
    void themeKey.value
    return typeof document === 'undefined' ? FALLBACK_COLORS : (colors.value = readColors())
  })
}
