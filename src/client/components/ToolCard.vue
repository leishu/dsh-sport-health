/**
 * Chart-first view for a single sport-health MCP tool call.
 *
 * The MCP bridge registers tools as `mcp__server__tool`; the payload is a
 * JSON document inside the text content of the tool result, so it is parsed
 * directly from the recorded block, with no extra host round-trip.
 */
<script setup lang="ts">
import { computed } from 'vue'
import { ElCollapse, ElCollapseItem, ElTag } from './element.ts'
import ThemeProvider from './ThemeProvider.vue'
import ToolViews from './ToolViews.vue'
import { C, tagType } from '../lib/theme.ts'
import { TITLES, ICONS, parsePayload, rawName, subtitleFor } from '../lib/payload.ts'

const props = withDefaults(defineProps<{
  toolName: string
  phase?: 'preparing' | 'start' | 'result'
  block?: any
}>(), { phase: 'start', block: undefined })

const name = computed(() => rawName(props.toolName ?? ''))
const title = computed(() => TITLES[name.value] ?? name.value)
const icon = computed(() => ICONS[name.value] ?? '📊')
const parsed = computed(() => (props.phase === 'result' ? parsePayload(props.block) : {}))
const payload = computed(() => parsed.value.value)
const failed = computed(() => Boolean(props.block?.isError))
const pending = computed(() => props.phase !== 'result')
const subtitle = computed(() => (payload.value === undefined ? undefined : subtitleFor(name.value, payload.value)))
const status = computed(() => ({
  text: failed.value ? '失败' : pending.value ? '调用中' : '完成',
  tone: failed.value ? C.red : pending.value ? C.amber : C.green,
}))
const raw = computed(() => (payload.value === undefined ? rawText(parsed.value.text) : JSON.stringify(payload.value, null, 2)))

function rawText(text?: string): string {
  return text === undefined || text === '' ? '（无内容）' : text
}
</script>

<template>
  <ThemeProvider>
    <div class="sh-card sh-card--tool">
      <header class="sh-header">
        <div class="sh-header__icon">{{ icon }}</div>
        <div style="min-width: 0">
          <div class="sh-header__title">{{ title }}</div>
          <div v-if="subtitle" class="sh-header__sub">{{ subtitle }}</div>
        </div>
        <div class="sh-header__right">
          <ElTag :type="tagType(status.tone)" size="small" effect="light" round>{{ status.text }}</ElTag>
        </div>
      </header>

      <p v-if="pending" class="sh-note">正在等待 sport-health MCP 返回数据…</p>
      <ElAlert
        v-else-if="failed"
        type="error"
        :closable="false"
        show-icon
        title="工具调用失败"
        :description="parsed.text || '未知错误'"
      />
      <ElAlert
        v-else-if="payload === undefined"
        type="warning"
        :closable="false"
        show-icon
        title="无法解析工具返回内容"
        :description="parsed.text || '返回内容不是 JSON'"
      />
      <ToolViews v-else :d="payload" :tool="name" />

      <ElCollapse v-if="!pending && payload !== undefined" class="sh-raw">
        <ElCollapseItem title="原始数据" name="raw">
          <pre>{{ raw }}</pre>
        </ElCollapseItem>
      </ElCollapse>
    </div>
  </ThemeProvider>
</template>

<style>
.sh-card--tool {
  padding: 14px;
  min-width: 0;
  border-radius: 12px;
  border: 1px solid var(--sh-border);
  background: var(--sh-surface);
  color: inherit;
}
.sh-card--tool .el-collapse {
  border: none;
  --el-collapse-header-bg-color: transparent;
  --el-collapse-content-bg-color: transparent;
  --el-collapse-border-color: transparent;
  --el-collapse-header-text-color: var(--sh-faint);
  --el-collapse-header-font-size: 11.5px;
  --el-collapse-content-text-color: inherit;
}
.sh-card--tool .el-collapse-item__header {
  height: 26px;
  line-height: 26px;
  border-bottom: none;
}
.sh-card--tool .el-collapse-item__wrap { border-bottom: none; }
.sh-card--tool .el-collapse-item__content { padding-bottom: 0; }
.sh-card--tool .el-alert { padding: 10px 12px; }
.sh-card--tool .el-alert__description { white-space: pre-wrap; word-break: break-word; }
</style>
