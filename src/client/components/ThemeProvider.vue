/**
 * Theme provider for the cards and the dashboard.
 *
 * `「div data-theme」` scopes Element Plus variables, while a `useThemeKey()`
 * counter is shared with charts so they can repaint when the mode flips.
 */
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref } from 'vue'
import { ensureThemeVars, type ThemeMode } from '../lib/theme.ts'

const props = withDefaults(defineProps<{ mode?: ThemeMode }>(), { mode: undefined })

const systemDark = ref(false)
const forced = ref<ThemeMode | undefined>(props.mode)
const themeKey = ref(0)

provide('sh-theme-key', themeKey)

const resolved = computed<ThemeMode>(() => forced.value ?? (systemDark.value ? 'dark' : 'light'))

let media: MediaQueryList | null = null
const onChange = (event: MediaQueryListEvent) => { systemDark.value = event.matches }

onMounted(() => {
  ensureThemeVars()
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    media = window.matchMedia('(prefers-color-scheme: dark)')
    systemDark.value = media.matches
    media.addEventListener?.('change', onChange)
  }
  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    const observer = new MutationObserver(() => { themeKey.value += 1 })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
    onBeforeUnmount(() => observer.disconnect())
  }
})

onBeforeUnmount(() => { media?.removeEventListener?.('change', onChange) })

defineExpose({ theme: resolved })
</script>

<template>
  <div :data-theme="resolved">
    <slot />
  </div>
</template>
