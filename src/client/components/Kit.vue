/**
 * Small building blocks layered on Element Plus.
 *
 * `ShPanel` renders a themed card with an optional title row; `ShKpi` renders
 * either one KPI tile (via `label`/`value`) or a responsive grid of tiles (via
 * `items`).
 */
<script lang="ts">
import { defineComponent, h, type PropType } from 'vue'
import { ElCard } from './element.ts'

/** Comma-formats a numeric value for KPI tiles. */
function pretty(value?: string | number): string | number | undefined {
  if (typeof value !== 'number') return value
  return Number.isFinite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : String(value)
}

export const ShPanel = defineComponent({
  name: 'ShPanel',
  props: {
    title: { type: String as PropType<string | undefined>, default: undefined },
    subtitle: { type: String as PropType<string | undefined>, default: undefined },
  },
  setup(props, { slots }) {
    return () => h(ElCard, { class: 'sh-card', shadow: 'never' }, () => [
      (props.title || slots.right) && h('div', { class: 'sh-divider' }, [
        h('div', { style: 'min-width:0' }, [
          props.title ? h('div', { class: 'sh-divider__title' }, props.title) : null,
          props.subtitle ? h('div', { class: 'sh-divider__sub' }, props.subtitle) : null,
        ]),
        slots.right ? h('div', { style: 'margin-left:auto;flex-shrink:0' }, slots.right()) : null,
      ]),
      slots.default ? slots.default() : null,
    ])
  },
})
</script>

<script setup lang="ts">
import { computed } from 'vue'

interface KpiItem {
  label: string
  value?: string | number
  unit?: string
  hint?: string
  tone?: string
}

const props = defineProps<{
  label?: string
  value?: string | number
  unit?: string
  hint?: string
  tone?: string
  items?: KpiItem[]
}>()

const dense = (value?: string | number) => String(value ?? '').length > 11
/** 必须保持响应式：看板刷新后 `items` 会换一个新数组，非响应式快照会停在旧值。 */
const kpis = computed(() => props.items ?? [])
</script>

<template>
  <div v-if="items" class="sh-kpis">
    <div v-for="(item, index) in kpis" :key="index" class="sh-kpi">
      <div class="sh-kpi__label" :title="item.label">{{ item.label }}</div>
      <div class="sh-kpi__row" :style="item.tone ? { color: item.tone } : undefined">
        <span class="sh-kpi__value" :class="{ 'is-dense': dense(item.value) }">{{ pretty(item.value) ?? '—' }}</span>
        <span v-if="item.unit" class="sh-kpi__unit">{{ item.unit }}</span>
      </div>
      <div v-if="item.hint" class="sh-kpi__hint">{{ item.hint }}</div>
    </div>
  </div>
  <div v-else class="sh-kpi">
    <div class="sh-kpi__label" :title="props.label">{{ props.label }}</div>
    <div class="sh-kpi__row" :style="props.tone ? { color: props.tone } : undefined">
      <span class="sh-kpi__value" :class="{ 'is-dense': dense(props.value) }">{{ pretty(props.value) ?? '—' }}</span>
      <span v-if="props.unit" class="sh-kpi__unit">{{ props.unit }}</span>
    </div>
    <div v-if="props.hint" class="sh-kpi__hint">{{ props.hint }}</div>
  </div>
</template>
